export const CURRENT_USER_QUERY_KEY = ["gateway", "me"] as const;
export const ENVIRONMENTS_QUERY_KEY = ["gateway", "environments"] as const;
export const GATEWAY_STATUS_QUERY_KEY = ["gateway", "status"] as const;
export const IS_BROWSER = typeof window !== "undefined";

export const environmentClientsQueryKey = (environmentId: string | undefined) =>
  ["gateway", "environments", environmentId, "clients"] as const;
