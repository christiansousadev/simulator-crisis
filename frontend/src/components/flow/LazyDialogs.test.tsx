import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import LazyDialogs from "./LazyDialogs";

beforeEach(() => {
  useGameStore.setState({ postMortem: null, creditsOpen: false, reducedMotionPref: "off" });
});

// the lazy hosts must hand the dialog's own enter/exit animation (usePresence) back untouched
describe("LazyDialogs", () => {
  it("mounts nothing until a dialog is first opened", () => {
    render(<LazyDialogs />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("loads the chunk on first open, then keeps it mounted so closing still animates out", async () => {
    render(<LazyDialogs />);
    act(() => useGameStore.setState({ postMortem: { incidentId: "inc-1", markdown: "# Report\n\n- **T+1:** created" } }));
    expect(await screen.findByRole("heading", { name: "Report" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");

    // closing flips the store flag; the dialog stays mounted (closing) for its exit, then unmounts
    act(() => useGameStore.setState({ postMortem: null }));
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 2000 });

    // and it reopens from the already-loaded chunk with the last content discarded
    act(() => useGameStore.setState({ postMortem: { incidentId: "inc-2", markdown: "# Second" } }));
    expect(await screen.findByRole("heading", { name: "Second" })).toBeInTheDocument();
  });

  it("opens the credits dialog from its own store flag", async () => {
    render(<LazyDialogs />);
    act(() => useGameStore.setState({ creditsOpen: true }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
