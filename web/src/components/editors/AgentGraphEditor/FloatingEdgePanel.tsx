import { FieldGroup, Input } from "@/components/base";
import type {
  BuiltinEdgeCondition,
  EdgePredicate,
  GraphEdgeConfig,
  PredicateOperator,
} from "@/types/graphConfig";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ConditionKind = "none" | "builtin" | "custom";

function getConditionKind(when: GraphEdgeConfig["when"]): ConditionKind {
  if (!when) return "none";
  if (typeof when === "string") return "builtin";
  return "custom";
}

interface FloatingEdgePanelProps {
  edge: GraphEdgeConfig;
  onUpdate: (updates: {
    label?: string | null;
    priority?: number;
    when?: GraphEdgeConfig["when"];
  }) => void;
  onClose: () => void;
  onDelete: () => void;
}

/**
 * Floating panel positioned on the left side for editing edge properties.
 */
function FloatingEdgePanel({
  edge,
  onUpdate,
  onClose,
  onDelete,
}: FloatingEdgePanelProps) {
  const { t } = useTranslation();

  const [label, setLabel] = useState(edge.label || "");
  const [priority, setPriority] = useState(edge.priority || 0);
  const [conditionKind, setConditionKind] = useState<ConditionKind>(
    getConditionKind(edge.when),
  );
  const [builtinCondition, setBuiltinCondition] =
    useState<BuiltinEdgeCondition>(
      typeof edge.when === "string"
        ? (edge.when as BuiltinEdgeCondition)
        : "has_tool_calls",
    );
  const [statePath, setStatePath] = useState(
    typeof edge.when === "object" && edge.when
      ? (edge.when as EdgePredicate).state_path
      : "",
  );
  const [operator, setOperator] = useState<PredicateOperator>(
    typeof edge.when === "object" && edge.when
      ? (edge.when as EdgePredicate).operator
      : "eq",
  );
  const [predicateValue, setPredicateValue] = useState(
    typeof edge.when === "object" && edge.when
      ? String((edge.when as EdgePredicate).value ?? "")
      : "",
  );

  // Sync local state when edge changes
  useEffect(() => {
    setLabel(edge.label || "");
    setPriority(edge.priority || 0);
    const kind = getConditionKind(edge.when);
    setConditionKind(kind);
    if (typeof edge.when === "string") {
      setBuiltinCondition(edge.when as BuiltinEdgeCondition);
    } else if (typeof edge.when === "object" && edge.when) {
      const pred = edge.when as EdgePredicate;
      setStatePath(pred.state_path);
      setOperator(pred.operator);
      setPredicateValue(String(pred.value ?? ""));
    }
  }, [edge]);

  // Build the `when` value from current state
  const buildWhen = useCallback((): GraphEdgeConfig["when"] => {
    if (conditionKind === "none") return null;
    if (conditionKind === "builtin") return builtinCondition;
    const pred: EdgePredicate = {
      state_path: statePath,
      operator,
    };
    if (operator === "eq" || operator === "neq") {
      pred.value = predicateValue;
    }
    return pred;
  }, [conditionKind, builtinCondition, statePath, operator, predicateValue]);

  const flush = useCallback(() => {
    onUpdate({
      label: label || null,
      priority,
      when: buildWhen(),
    });
  }, [label, priority, buildWhen, onUpdate]);

  // Immediately push condition kind changes
  const handleConditionKindChange = useCallback(
    (kind: ConditionKind) => {
      setConditionKind(kind);
      let when: GraphEdgeConfig["when"] = null;
      if (kind === "builtin") when = builtinCondition;
      if (kind === "custom")
        when = { state_path: statePath || "state.key", operator: "eq" };
      onUpdate({ when });
    },
    [builtinCondition, statePath, onUpdate],
  );

  const handleBuiltinChange = useCallback(
    (val: string) => {
      const bc = val as BuiltinEdgeCondition;
      setBuiltinCondition(bc);
      onUpdate({ when: bc });
    },
    [onUpdate],
  );

  const handleOperatorChange = useCallback(
    (val: string) => {
      const op = val as PredicateOperator;
      setOperator(op);
      const pred: EdgePredicate = { state_path: statePath, operator: op };
      if (op === "eq" || op === "neq") pred.value = predicateValue;
      onUpdate({ when: pred });
    },
    [statePath, predicateValue, onUpdate],
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="absolute left-3 top-3 bottom-3 z-50 flex w-72 flex-col overflow-hidden rounded-lg bg-white/95 shadow-2xl backdrop-blur-sm dark:bg-neutral-800/95 dark:shadow-neutral-900/50"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200/60 px-4 py-3 dark:border-neutral-800/60">
          <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
            {t("agents.graphEditor.edge.title")}
          </span>
          <Button
            onClick={onClose}
            className="rounded-md p-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            <XMarkIcon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          </Button>
        </div>

        {/* Form */}
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="space-y-4 px-4 py-4">
            {/* Label */}
            <FieldGroup label={t("agents.graphEditor.edge.label")}>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={flush}
                placeholder={t("agents.graphEditor.edge.labelPlaceholder")}
              />
            </FieldGroup>

            {/* Priority */}
            <FieldGroup label={t("agents.graphEditor.edge.priority")}>
              <Input
                type="number"
                value={String(priority)}
                onChange={(e) =>
                  setPriority(Math.max(0, Number(e.target.value) || 0))
                }
                onBlur={flush}
                min={0}
              />
            </FieldGroup>

            {/* Condition type */}
            <FieldGroup label={t("agents.graphEditor.edge.conditionType")}>
              <Select
                value={conditionKind}
                onValueChange={handleConditionKindChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("agents.graphEditor.edge.conditionNone")}
                  </SelectItem>
                  <SelectItem value="builtin">
                    {t("agents.graphEditor.edge.conditionBuiltin")}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t("agents.graphEditor.edge.conditionCustom")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FieldGroup>

            {/* Built-in condition */}
            {conditionKind === "builtin" && (
              <FieldGroup label={t("agents.graphEditor.edge.builtinCondition")}>
                <Select
                  value={builtinCondition}
                  onValueChange={handleBuiltinChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="has_tool_calls">
                      {t("agents.graphEditor.edge.hasToolCalls")}
                    </SelectItem>
                    <SelectItem value="no_tool_calls">
                      {t("agents.graphEditor.edge.noToolCalls")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>
            )}

            {/* Custom predicate */}
            {conditionKind === "custom" && (
              <>
                <FieldGroup label={t("agents.graphEditor.edge.statePath")}>
                  <Input
                    value={statePath}
                    onChange={(e) => setStatePath(e.target.value)}
                    onBlur={flush}
                    placeholder={t(
                      "agents.graphEditor.edge.statePathPlaceholder",
                    )}
                  />
                </FieldGroup>

                <FieldGroup label={t("agents.graphEditor.edge.operator")}>
                  <Select value={operator} onValueChange={handleOperatorChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">eq</SelectItem>
                      <SelectItem value="neq">neq</SelectItem>
                      <SelectItem value="truthy">truthy</SelectItem>
                      <SelectItem value="falsy">falsy</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldGroup>

                {(operator === "eq" || operator === "neq") && (
                  <FieldGroup label={t("agents.graphEditor.edge.value")}>
                    <Input
                      value={predicateValue}
                      onChange={(e) => setPredicateValue(e.target.value)}
                      onBlur={flush}
                      placeholder={t(
                        "agents.graphEditor.edge.valuePlaceholder",
                      )}
                    />
                  </FieldGroup>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer — delete */}
        <div className="shrink-0 border-t border-neutral-200/60 px-4 py-3 dark:border-neutral-800/60">
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-50/80 px-3 py-2 text-[13px] font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50"
          >
            <TrashIcon className="h-4 w-4" />
            {t("agents.graphEditor.edge.deleteEdge")}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(FloatingEdgePanel);
