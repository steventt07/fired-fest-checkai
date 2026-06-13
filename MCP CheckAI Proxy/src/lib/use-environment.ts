import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  listEnvironments,
  type McpEnvironment,
} from "@/lib/mcp-dev.functions";

const ACTIVE_KEY = "checkai.activeEnvironment";

export function useEnvironment() {
  const fetchEnvs = useServerFn(listEnvironments);
  const [environments, setEnvironments] = useState<McpEnvironment[]>([]);
  const [activeName, setActiveNameState] = useState<string>(() => {
    if (typeof window === "undefined") return "dev";
    return localStorage.getItem(ACTIVE_KEY) ?? "dev";
  });
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchEnvs();
      if (res.ok) {
        setEnvironments(res.environments);
        // Fall back to the first env if the stored name no longer exists.
        setActiveNameState((prev) =>
          res.environments.some((e) => e.name === prev)
            ? prev
            : (res.environments[0]?.name ?? prev),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [fetchEnvs]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setActiveName = useCallback((name: string) => {
    setActiveNameState(name);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, name);
  }, []);

  const active =
    environments.find((e) => e.name === activeName) ?? environments[0] ?? null;

  return { environments, active, activeName, setActiveName, loading, reload };
}
