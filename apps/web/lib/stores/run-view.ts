"use client"

import { create } from "zustand"

interface RunViewState {
  selectedNode: string
  gate1Approved: boolean
  setSelectedNode: (id: string) => void
  setGate1Approved: (next: boolean) => void
  accepted: Record<string, boolean>
  rejected: Record<string, boolean>
  toggleAccept: (id: string) => void
  toggleReject: (id: string) => void
  acceptAll: (ids: string[]) => void
  reset: () => void
}

const initial = {
  selectedNode: "a2",
  gate1Approved: true,
  accepted: {} as Record<string, boolean>,
  rejected: {} as Record<string, boolean>,
}

export const useRunView = create<RunViewState>((set) => ({
  ...initial,
  setSelectedNode: (id) => set({ selectedNode: id }),
  setGate1Approved: (next) => set({ gate1Approved: next }),
  toggleAccept: (id) =>
    set((s) => ({
      accepted: { ...s.accepted, [id]: !s.accepted[id] },
      rejected: { ...s.rejected, [id]: false },
    })),
  toggleReject: (id) =>
    set((s) => ({
      rejected: { ...s.rejected, [id]: !s.rejected[id] },
      accepted: { ...s.accepted, [id]: false },
    })),
  acceptAll: (ids) =>
    set(() => ({
      accepted: Object.fromEntries(ids.map((id) => [id, true])),
      rejected: {},
    })),
  reset: () => set(initial),
}))
