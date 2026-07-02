import { createContext, useContext } from "react";

interface SelectedCaseContextType {
  selectedCaseId: string;
  /** True once the getCaseIdsByPatientId fetch has finished (success or error). */
  caseIdsFetchDone: boolean;
}

export const SelectedCaseContext = createContext<SelectedCaseContextType>({
  selectedCaseId: "",
  caseIdsFetchDone: false,
});

export function useSelectedCase(): SelectedCaseContextType {
  return useContext(SelectedCaseContext);
}
