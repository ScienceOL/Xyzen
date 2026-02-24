"use client";

import { FieldGroup } from "@/components/base/FieldGroup";
import { Input } from "@/components/base/Input";
import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import {
  sandboxService,
  type SandboxProfileUpdate,
} from "@/service/sandboxService";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface SandboxConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Parse a string to number | null. Empty / NaN → null. */
function toNumOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function SandboxConfigModalInner({ isOpen, onClose }: SandboxConfigModalProps) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SandboxProfileUpdate>({});

  // Fetch profile on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    sandboxService
      .getSandboxProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile) {
          setForm({
            cpu: profile.cpu,
            memory: profile.memory,
            disk: profile.disk,
            auto_stop_minutes: profile.auto_stop_minutes,
            auto_delete_minutes: profile.auto_delete_minutes,
            timeout: profile.timeout,
            image: profile.image,
          });
        } else {
          setForm({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const setField = useCallback(
    <K extends keyof SandboxProfileUpdate>(
      key: K,
      value: SandboxProfileUpdate[K],
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await sandboxService.updateSandboxProfile(form);
      toast.success(t("app.sandbox.config.saved"));
      onClose();
    } catch {
      toast.error(t("app.sandbox.config.saveError"));
    } finally {
      setSaving(false);
    }
  }, [form, t, onClose]);

  const handleReset = useCallback(async () => {
    setSaving(true);
    try {
      await sandboxService.resetSandboxProfile();
      setForm({});
      toast.success(t("app.sandbox.config.reset"));
    } catch {
      toast.error(t("app.sandbox.config.resetError"));
    } finally {
      setSaving(false);
    }
  }, [t]);

  const numValue = (v: number | null | undefined): string =>
    v != null ? String(v) : "";

  return (
    <SheetModal isOpen={isOpen} onClose={onClose} size="sm">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("app.sandbox.config.title")}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
          {t("app.sandbox.config.subtitle")}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-[13px] text-neutral-400">
              {t("common.loading")}
            </p>
          </div>
        ) : (
          <div className="space-y-6 px-5 py-5">
            {/* Resources */}
            <section>
              <h3 className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-white">
                {t("app.sandbox.config.resources")}
              </h3>
              <div className="space-y-4">
                <FieldGroup
                  label={t("app.sandbox.config.cpu")}
                  hint={t("app.sandbox.config.cpuHint")}
                >
                  <Input
                    type="number"
                    placeholder="2 (default)"
                    value={numValue(form.cpu)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField("cpu", toNumOrNull(e.target.value))
                    }
                  />
                </FieldGroup>
                <FieldGroup
                  label={t("app.sandbox.config.memory")}
                  hint={t("app.sandbox.config.memoryHint")}
                >
                  <Input
                    type="number"
                    placeholder="512 (default)"
                    value={numValue(form.memory)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField("memory", toNumOrNull(e.target.value))
                    }
                  />
                </FieldGroup>
                <FieldGroup
                  label={t("app.sandbox.config.disk")}
                  hint={t("app.sandbox.config.diskHint")}
                >
                  <Input
                    type="number"
                    placeholder="2048 (default)"
                    value={numValue(form.disk)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField("disk", toNumOrNull(e.target.value))
                    }
                  />
                </FieldGroup>
              </div>
            </section>

            {/* Lifecycle */}
            <section>
              <h3 className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-white">
                {t("app.sandbox.config.lifecycle")}
              </h3>
              <div className="space-y-4">
                <FieldGroup
                  label={t("app.sandbox.config.autoStop")}
                  hint={t("app.sandbox.config.autoStopHint")}
                >
                  <Input
                    type="number"
                    placeholder="15 (default)"
                    value={numValue(form.auto_stop_minutes)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField("auto_stop_minutes", toNumOrNull(e.target.value))
                    }
                  />
                </FieldGroup>
                <FieldGroup
                  label={t("app.sandbox.config.autoDelete")}
                  hint={t("app.sandbox.config.autoDeleteHint")}
                >
                  <Input
                    type="number"
                    placeholder="60 (default)"
                    value={numValue(form.auto_delete_minutes)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField(
                        "auto_delete_minutes",
                        toNumOrNull(e.target.value),
                      )
                    }
                  />
                </FieldGroup>
              </div>
            </section>

            {/* Runtime */}
            <section>
              <h3 className="mb-3 text-[13px] font-semibold text-neutral-900 dark:text-white">
                {t("app.sandbox.config.runtime")}
              </h3>
              <div className="space-y-4">
                <FieldGroup
                  label={t("app.sandbox.config.timeout")}
                  hint={t("app.sandbox.config.timeoutHint")}
                >
                  <Input
                    type="number"
                    placeholder="300 (default)"
                    value={numValue(form.timeout)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField("timeout", toNumOrNull(e.target.value))
                    }
                  />
                </FieldGroup>
                <FieldGroup
                  label={t("app.sandbox.config.image")}
                  hint={t("app.sandbox.config.imageHint")}
                >
                  <Input
                    type="text"
                    placeholder="(default)"
                    value={form.image ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setField("image", e.target.value || null)
                    }
                  />
                </FieldGroup>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex items-center justify-between">
          <button
            onClick={() => void handleReset()}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-500 transition-colors hover:bg-neutral-100/80 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
          >
            {t("app.sandbox.config.resetDefaults")}
          </button>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-200/80 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50 dark:hover:bg-indigo-400"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </SheetModal>
  );
}

const SandboxConfigModal = React.memo(SandboxConfigModalInner);
export default SandboxConfigModal;
