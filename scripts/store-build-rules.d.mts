// Types for store-build-rules.mjs, which stays plain JavaScript because EAS
// runs it before dependencies are installed.

type Env = Record<string, string | undefined>;

export type StoreBuild = {
  /** EAS_BUILD_PROFILE: the name of the build profile in eas.json. */
  profile: string | undefined;
  /** The environment the build machine sees. */
  env: Env;
  /** What eas.json gives the profile, from reviewedSwitches. */
  switches?: Record<string, string>;
};

export declare const isEasBuild: (env: Env) => boolean;

export declare const isLocalEasBuild: (env: Env) => boolean;

export declare const isStoreBuild: (profile: string | undefined) => boolean;

export declare const reviewedSwitches: (
  easJson: unknown,
  profile: string | undefined,
  platform?: string
) => Record<string, string>;

export declare const setTwice: (env: Env, switches: Record<string, string>) => string[];

export declare const storeBuildProblems: (build: StoreBuild) => string[];

/** The names a store build must not carry while nothing is sold. */
export declare const notSoldYet: string[];

/** Asks the project whether the two backend values are its own. A report line, or null. */
export declare const backendAnswer: (
  env: Env,
  request?: (url: URL, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number }>
) => Promise<string | null>;
