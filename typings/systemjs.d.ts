interface Module {
  name: string;
  address: string;
  source?: string;
  metadata?: any;
}

interface SystemJS {
  import(name: string): any;
  defined: any;
  amdDefine: () => void;
  amdRequire: () => void;
  baseURL: string;
  paths: { [key: string]: string };
  meta: { [key: string]: Object };
  config: any;
  normalize(dep: string, parent: string): Promise<string>;
  fetch(load: Module): Promise<string>;

  typescriptOptions?: any;
}

declare var System: SystemJS;

declare module "systemjs" {
  export = System;
}