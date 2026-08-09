import type { BaseContext, WsSchema } from '../shared';

export type HookArgs<T extends WsSchema, Context extends BaseContext> = {
  entity: keyof T;
  operation: keyof T[keyof T];
  params: any;
  context: Context;
};

export type Hooks<T extends WsSchema, Context extends BaseContext> = {
  preCall?: (args: HookArgs<T, Context>) => void;
  postCall?: (args: HookArgs<T, Context>, performance: number) => void;
  error?: (args: HookArgs<T, Context>, performance: number, error: any) => void;
};
