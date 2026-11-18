export function toolVersions(ciYaml: string, securityYaml: string): {
  actionlint: { version: string; sha256: string };
  zizmor: { version: string };
};
