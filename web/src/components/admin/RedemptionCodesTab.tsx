import type { AdminCode } from "@/service/redemptionService";
import { CodeGenerationForm } from "./CodeGenerationForm";
import { CodesList } from "./CodesList";

interface RedemptionCodesTabProps {
  adminSecret: string;
  backendUrl: string;
  newCode: AdminCode | undefined;
  newCodeKey: number;
  onCodeGenerated: (code: AdminCode) => void;
}

export function RedemptionCodesTab({
  adminSecret,
  backendUrl,
  newCode,
  newCodeKey,
  onCodeGenerated,
}: RedemptionCodesTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-4 overflow-hidden">
      <CodeGenerationForm
        adminSecret={adminSecret}
        backendUrl={backendUrl}
        onCodeGenerated={onCodeGenerated}
      />
      <CodesList
        adminSecret={adminSecret}
        backendUrl={backendUrl}
        newCode={newCode}
        newCodeKey={newCodeKey}
      />
    </div>
  );
}
