import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import PostMortemModal from "../modals/PostMortemModal";
import AuditorChat from "./AuditorChat";

type Handler = (method: string, url: string, body: unknown) => { status: number; body: unknown; headers?: Record<string, string> };

function mockFetch(handler: Handler) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const res = handler(method, url, body);
      return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
    })
  );
  return calls;
}

const noHistory = { status: 404, body: { detail: "No interview found for this incident" } };

beforeEach(() => {
  useGameStore.setState({ reducedMotionPref: "on", floatingTexts: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PostMortemModal auditor tab", () => {
  it("switches between Report and Auditor with pressed-state buttons, not tabs", async () => {
    mockFetch(() => noHistory);
    useGameStore.setState({ postMortem: { incidentId: "inc-1", markdown: "# Report body" } });
    render(<PostMortemModal />);
    const report = await screen.findByRole("button", { name: "Report" });
    const auditor = screen.getByRole("button", { name: "Auditor" });
    expect(screen.queryByRole("tab")).toBeNull();
    expect(report).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("auditor-chat")).toBeNull();

    await userEvent.click(auditor);
    expect(auditor).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("auditor-chat")).toBeInTheDocument();

    await userEvent.click(report);
    expect(report).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Report body" })).toBeInTheDocument();
    useGameStore.setState({ postMortem: null });
  });
});

describe("AuditorChat", () => {
  it("send -> reply -> verdict -> apply, showing only backend numbers", async () => {
    const calls = mockFetch((method, url) => {
      if (method === "GET") return noHistory;
      if (url.endsWith("/apply-verdict")) {
        return { status: 200, body: { success: true, budget: 97000, verdict: "NON_COMPLIANT", applied_amount: 3000 } };
      }
      return {
        status: 200,
        body: {
          incident_id: "inc-1",
          reply: "That is not compliant.",
          verdict: "NON_COMPLIANT",
          regulatory_fine_adjustment: 3000,
          adjustment_cap: 6000,
          applied: false,
          transcript_turn: 1,
        },
      };
    });
    render(<AuditorChat incidentId="inc-1" />);
    expect(await screen.findByText(/No questions yet/)).toBeInTheDocument();

    const apply = screen.getByRole("button", { name: "Apply verdict" });
    expect(apply).toBeDisabled();
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox"), "  I rolled back at once  ");
    expect(send).toBeEnabled();
    await userEvent.click(send);

    expect(await screen.findByText("That is not compliant.")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/interview"));
    expect(post?.body).toEqual({ message: "I rolled back at once" });
    expect(screen.getByRole("log")).toHaveTextContent("I rolled back at once");
    expect(screen.getByTestId("auditor-verdict")).toHaveAttribute("data-verdict", "NON_COMPLIANT");
    expect(screen.getByTestId("auditor-proposed")).toHaveTextContent("Proposed: +US$3,000 fine (cap US$6,000)");
    expect(screen.getByRole("textbox")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Apply verdict" }));
    expect(await screen.findByRole("button", { name: "Applied" })).toBeDisabled();
    expect(screen.getByText("Fine of US$3,000 charged to the budget")).toBeInTheDocument();
    const toasts = useGameStore.getState().floatingTexts;
    expect(toasts[toasts.length - 1]?.text).toContain("US$3,000");
  });

  it("sends with Ctrl+Enter", async () => {
    const calls = mockFetch((method) =>
      method === "GET"
        ? noHistory
        : { status: 200, body: { incident_id: "inc-1", reply: "Go on.", verdict: "PENDING", regulatory_fine_adjustment: 0, transcript_turn: 1 } }
    );
    render(<AuditorChat incidentId="inc-1" />);
    await screen.findByText(/No questions yet/);
    await userEvent.type(screen.getByRole("textbox"), "answer{Control>}{Enter}{/Control}");
    expect(await screen.findByText("Go on.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(screen.getByTestId("auditor-verdict")).toHaveAttribute("data-verdict", "PENDING");
    expect(screen.getByRole("button", { name: "Apply verdict" })).toBeDisabled();
  });

  it("shows a calm not-configured state on 503 and keeps the typed message", async () => {
    mockFetch((method) => (method === "GET" ? noHistory : { status: 503, body: { detail: "AI Auditor interview service is not configured" } }));
    render(<AuditorChat incidentId="inc-1" />);
    await screen.findByText(/No questions yet/);
    await userEvent.type(screen.getByRole("textbox"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/not configured on this server/)).toBeInTheDocument();
    expect(screen.getByText(/LLM_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue("hello");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("shows the retry-after on 429 and retries without retyping", async () => {
    let attempt = 0;
    const calls = mockFetch((method) => {
      if (method === "GET") return noHistory;
      attempt += 1;
      if (attempt === 1) return { status: 429, body: { detail: "Too many interview turns" }, headers: { "Retry-After": "30" } };
      return { status: 200, body: { incident_id: "inc-1", reply: "Welcome back.", verdict: "PENDING", regulatory_fine_adjustment: 0, transcript_turn: 1 } };
    });
    render(<AuditorChat incidentId="inc-1" />);
    await screen.findByText(/No questions yet/);
    await userEvent.type(screen.getByRole("textbox"), "again please");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/wait 30s/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("again please");

    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((p) => p.body)).toEqual([{ message: "again please" }, { message: "again please" }]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats 'already applied' as the Applied state and surfaces other apply errors", async () => {
    const history = {
      incident_id: "inc-1",
      turns: [
        { role: "player", content: "q" },
        { role: "auditor", content: "verdict reached" },
      ],
      verdict: "JUSTIFIED",
      regulatory_fine_adjustment: -1500,
      adjustment_cap: 2000,
      applied: false,
      transcript_turn: 1,
    };
    let applyBody = { detail: "This interview verdict has already been applied" };
    mockFetch((method) => {
      if (method === "GET") return { status: 200, body: history };
      return { status: 400, body: applyBody };
    });
    render(<AuditorChat incidentId="inc-1" />);
    expect(await screen.findByText("verdict reached")).toBeInTheDocument();
    expect(screen.getByTestId("auditor-proposed")).toHaveTextContent("Proposed: -US$1,500 credit (cap US$2,000)");

    applyBody = { detail: "This incident belongs to a different session and cannot be applied to the current session" };
    await userEvent.click(screen.getByRole("button", { name: "Apply verdict" }));
    expect(await screen.findByText(/different session/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply verdict" })).toBeEnabled();

    applyBody = { detail: "This interview verdict has already been applied" };
    await userEvent.click(screen.getByRole("button", { name: "Apply verdict" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Applied" })).toBeDisabled());
    expect(screen.queryByText(/different session/)).toBeNull();
  });
});
