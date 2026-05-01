"use client";

import { createContext, useContext } from "react";

export interface JobWorkspaceValue {
  isAdmin: boolean;
}

const JobWorkspaceContext = createContext<JobWorkspaceValue>({ isAdmin: false });

export function JobWorkspaceProvider({
  value,
  children,
}: {
  value: JobWorkspaceValue;
  children: React.ReactNode;
}) {
  return <JobWorkspaceContext.Provider value={value}>{children}</JobWorkspaceContext.Provider>;
}

export function useJobWorkspace() {
  return useContext(JobWorkspaceContext);
}
