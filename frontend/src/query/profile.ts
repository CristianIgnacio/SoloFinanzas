import { queryOptions } from "@tanstack/react-query";
import { ProfileService } from "../services/profileService";
import { queryKeys } from "./keys";
import { cachePolicies } from "./policies";
import { readQuery } from "./readQuery";

/** Shared options; no request is executed until consumed. */
export const profileQueries = {
  current: (userId: string) => queryOptions({
    ...cachePolicies.profile,
    queryKey: queryKeys.profile(userId),
    queryFn: readQuery(signal => ProfileService.getProfile(signal)),
  }),
};
