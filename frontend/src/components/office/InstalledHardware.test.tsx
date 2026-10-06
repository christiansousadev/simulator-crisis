import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { InfrastructureNode } from "../../types/game";
import InstalledHardware from "./InstalledHardware";

vi.mock("../../services/api", () => ({
  api: { removeInfrastructureNode: vi.fn(), getState: vi.fn() },
}));
vi.mock("../../utils/sound", () => ({
  playClickSound: vi.fn(),
  playErrorSound: vi.fn(),
  playUiBackSound: vi.fn(),
}));

const node: InfrastructureNode = {
  id: "infra-1",
  session_id: "s",
  node_type: "redis_cache",
  grid_x: 0,
  grid_y: 0,
  status: "active",
  config_json: JSON.stringify({ target_service_id: "srv-auth", producer_service_id: null }),
};

function setNodes(nodes: InfrastructureNode[]) {
  useGameStore.setState({
    language: "en",
    floatingTexts: [],
    telemetry: { ...useGameStore.getState().telemetry, infrastructure_nodes: nodes, is_running: true },
  });
}

const lastToast = () => {
  const toasts = useGameStore.getState().floatingTexts;
  return toasts[toasts.length - 1];
};

beforeEach(() => {
  vi.mocked(api.removeInfrastructureNode).mockReset();
  setNodes([node]);
});

describe("InstalledHardware", () => {
  it("renders nothing for a service without placed hardware", () => {
    const { container } = render(<InstalledHardware serviceId="srv-payment" />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the node with its type and the cost paid", () => {
    render(<InstalledHardware serviceId="srv-auth" />);
    expect(screen.getByText("Redis Cache Cluster")).toBeInTheDocument();
    expect(screen.getByText(`$${(12_000).toLocaleString()} paid`)).toBeInTheDocument();
  });

  it("asks before removing and does not call the api until confirmed", () => {
    render(<InstalledHardware serviceId="srv-auth" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Redis Cache Cluster" }));
    expect(screen.getByText("No refund. Remove?")).toBeInTheDocument();
    expect(api.removeInfrastructureNode).not.toHaveBeenCalled();
    // focus starts on Cancel so a stray Enter cannot destroy hardware
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("Cancel and Escape dismiss the question", () => {
    render(<InstalledHardware serviceId="srv-auth" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Redis Cache Cluster" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("No refund. Remove?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove Redis Cache Cluster" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(screen.queryByText("No refund. Remove?")).toBeNull();
    expect(api.removeInfrastructureNode).not.toHaveBeenCalled();
  });

  it("confirm removes the node and raises a success toast", async () => {
    vi.mocked(api.removeInfrastructureNode).mockResolvedValue({ success: true });
    render(<InstalledHardware serviceId="srv-auth" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Redis Cache Cluster" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });
    expect(api.removeInfrastructureNode).toHaveBeenCalledWith("infra-1");
    await waitFor(() => expect(lastToast()?.text).toBe("Redis Cache Cluster removed"));
    expect(lastToast()?.tone).toBe("success");
    // the next telemetry frame drops the node from the list
    act(() => setNodes([]));
    expect(screen.queryByTestId("installed-hardware")).toBeNull();
  });

  it("shows the backend error message verbatim when removal fails", async () => {
    vi.mocked(api.removeInfrastructureNode).mockRejectedValue(new Error("Infrastructure node not found"));
    render(<InstalledHardware serviceId="srv-auth" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Redis Cache Cluster" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    });
    await waitFor(() => expect(lastToast()?.text).toBe("Infrastructure node not found"));
    expect(lastToast()?.tone).toBe("danger");
  });
});
