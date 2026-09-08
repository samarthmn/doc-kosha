"use client";

import { useEffect, useMemo, useState } from "react";

type DocLite = {
  id: string;
  workspace_id?: string | null;
};

type AccessMode = "authenticated" | "public";

type UseDocumentAccessArgs = {
  doc: DocLite | null | undefined;
  accessMode?: AccessMode;
  allowEmails?: string[];
};

type UseDocumentAccessResult = {
  allowed: boolean;
  loading: boolean;
  reason: string | null;
};

export const useDocumentAccess = (
  args: UseDocumentAccessArgs,
): UseDocumentAccessResult => {
  const { doc } = args;
  const [allowed, setAllowed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        // Placeholder: Future implementation can check email/domain, workspace membership, link ACL, etc.
        // For now, always allow if a doc exists.
        const ok = !!doc;
        if (!active) return;
        setAllowed(ok);
        setReason(ok ? null : "Document not found");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [doc]);

  return useMemo(
    () => ({ allowed, loading, reason }),
    [allowed, loading, reason],
  );
};
