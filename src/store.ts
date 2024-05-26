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

function isEmptyObject(obj: Object) {
  return Object.keys(obj).length === 0;
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
    const permission = getPermission(this, key) ?? this.defaultPolicy;
    return permission.includes("r");
  }

  allowedToWrite(key: string): boolean {
    const permission = getPermission(this, key) ?? this.defaultPolicy;
    return permission.includes("w");
  }

  protected initializeProperties() {
    const intanceProps = Object.getOwnPropertyNames(this) as (keyof this)[];
    intanceProps.forEach((key) => {
      this.addPropertiesWithRequireAnnotation(key);
    });
  }

  private addPropertiesWithRequireAnnotation(key: keyof this) {
    const hasPermissionSet = getPermission(this, key as string);
    if (!!hasPermissionSet) {
      this.write(key as string, this[key] as StoreValue);
    }
  }

  read(path: string): StoreResult {
    this.permissionsAreValid(path);

    return this.getValueFromStore(path);
  }

  private getValueFromStore(path: string) {
    const storeObject = this.store as JSONObject;
    const keys = this.getKeysFrom(path);
    let currentKey = keys[0];
    let currentValue = storeObject[currentKey] as StoreResult;

    return this.getValueWithRightType(keys, currentValue);
  }

  private getValueWithRightType(keys: string[], currentValue: StoreResult) {
    for (let i = 1; i < keys.length; i++) {
      const key = keys[i];
      if (!currentValue) {
        return undefined;
      }

      if (currentValue instanceof Store) {
        currentValue = currentValue.read(key);
      } else if (typeof currentValue === "object") {
        currentValue = currentValue[key] as StoreResult;
      }
    }

    let valueAtPath = currentValue as StoreResult;
    return valueAtPath;
  }

  write(path: string, value: StoreValue): StoreValue {
    const storeObject = this.store as StoreValue;
    const keys = this.getKeysFrom(path);
    let currentValue = storeObject;
    currentValue = this.writeValuesUntilLastKey(keys, currentValue);
    this.writeLastKeyValue(keys, value, currentValue);

    return value;
  }

  private writeLastKeyValue(
    keys: string[],
    value: StoreValue,
    currentValue: StoreValue
  ) {
    let lastKey = keys[keys.length - 1];
    if (
      !(value instanceof Store) &&
      typeof value === "object" &&
      !isEmptyObject(value as JSONObject)
    ) {
      this.writeValueWhichIsAnObject(value, lastKey);
    } else if (currentValue instanceof Store) {
      this.writeToChildStore(currentValue, lastKey, value);
    } else {
      ((currentValue as JSONObject)[lastKey] as StoreValue) = value;
    }
  }

  private writeToChildStore(
    currentValue: Store,
    lastKey: string,
    value: StoreValue
  ) {
    currentValue.write(lastKey, value);

    return value;
  }

  private writeValueWhichIsAnObject(
    value: JSONObject | JSONArray | null,
    lastKey: string
  ) {
    this.writeEntries(value as JSONObject, lastKey);
  }

  private writeValuesUntilLastKey(keys: string[], currentValue: StoreValue) {
    for (let i = 0; i < keys.length - 1; i++) {
      const currentKey = keys[i];
      const currentKeys = keys.slice(0, i + 1).join(":");
      const valueToRead = this.read(currentKeys);
      if (!valueToRead) {
        currentValue = this.writeNestedKey(currentValue, currentKey);
      } else {
        currentValue = valueToRead as StoreValue;
      }
    }

    return currentValue;
  }

  private writeNestedKey(currentValue: StoreValue, currentKey: string) {
    if (currentValue instanceof Store) {
      currentValue = this.writeToChildStore(currentValue, currentKey, {});
    } else {
      if (currentKey === "store") {
        currentValue = this.writeChildAsNestedStore(currentValue, currentKey);
      } else {
        currentValue = this.writeSimpleNestedKey(currentValue, currentKey);
      }
    }
    return currentValue;
  }

  private writeSimpleNestedKey(
    currentValue: Exclude<StoreValue, Store>,
    currentKey: string
  ) {
    const currentValueAsObject = currentValue as JSONObject;
    currentValueAsObject[currentKey] = {};
    currentValue = currentValueAsObject[currentKey] as JSONObject;
    return currentValue;
  }

  private writeChildAsNestedStore(
    currentValue: StoreValue,
    currentKey: string
  ) {
    ((currentValue as JSONObject)[currentKey] as StoreResult) = new Store();
    currentValue = (currentValue as JSONObject)[
      currentKey
    ] as StoreResult as Store;
    return currentValue;
  }

  private permissionsAreValid(path: string) {
    const key = path.split(":")[0];
    const isAllowedToRead = this.allowedToRead(key);
    if (!isAllowedToRead) {
      throw new Error("Permission denied");
    }
  }

  writeEntries(entries: JSONObject, originPath: string = ""): void {
    const keys = this.transformEntriesIntoPaths(entries);

    for (const key of keys) {
      const path = Object.keys(key)[0];
      const fullPath = !!originPath ? `${originPath}:${path}` : path;
      const value = key[path];
      this.write(fullPath, value);
    }
  }

  private transformEntriesIntoPaths(
    entries: JSONObject,
    currentKey: string = "",
    paths: Record<string, StoreValue>[] = []
  ): Record<string, StoreValue>[] {
    for (const key in entries) {
      const value = entries[key];
      const currentPath = currentKey ? `${currentKey}:${key}` : key;
      if (typeof value === "object") {
        this.transformEntriesIntoPaths(value as JSONObject, currentPath, paths);
      } else {
        paths.push({ [currentPath]: value });
      }
    }

    return paths;
  }

  entries(): JSONObject {
    throw new Error("Method not implemented.");
  }

  private getKeysFrom(path: string) {
    return path.split(":");
  }
}
