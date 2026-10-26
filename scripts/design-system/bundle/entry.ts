// The FolioBuddy shared component library, re-exported unchanged from packages/frontend/src.
import * as library from './exports';

const target = window as unknown as { FolioBuddy?: Record<string, unknown> };
target.FolioBuddy = Object.assign(target.FolioBuddy ?? {}, library);
