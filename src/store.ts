import { JSONArray, JSONObject, JSONPrimitive } from "./json-types";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

const permissions = new Map<string, Permission>();

export function Restrict(
  permission: Permission = "none"
): (target: Object, propertyKey: string | symbol) => void {
  return function (target: Object, propertyKey: string | symbol) {
    const key = generateKey(target, propertyKey);
    permissions.set(key, permission);
  };
}

function getPermission(
  target: Object,
  propertyKey: string | symbol
): Permission | undefined {
  const key = generateKey(target, propertyKey);
  return permissions.get(key);
}

function generateKey(target: Object, propertyKey: string | symbol) {
  return `${target.constructor.name}.${String(propertyKey)}`;
}

export class Store implements IStore {
  private store: StoreValue = {};
  defaultPolicy: Permission = "rw";

  allowedToRead(key: string): boolean {
    const permission = permissions.get(key) ?? this.defaultPolicy;
    return permission.includes("r");
  }

  allowedToWrite(key: string): boolean {
    const permission = permissions.get(key) ?? this.defaultPolicy;
    return permission.includes("w");
  }

  read(path: string): StoreResult {
    const isAllowedToRead = this.allowedToRead(path);
    if (!isAllowedToRead) {
      throw new Error("Permission denied");
    }

    const storeObject = this.store as JSONObject;
    let valueAtPath = storeObject[path] as StoreResult;
    return valueAtPath;
  }

  write(path: string, value: StoreValue): StoreValue {
    const storeObject = this.store as JSONObject;
    (storeObject[path] as StoreValue) = value;
    return value;
  }

  writeEntries(entries: JSONObject): void {
    throw new Error("Method not implemented.");
  }

  entries(): JSONObject {
    throw new Error("Method not implemented.");
  }
}
