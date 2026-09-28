type MapUpsert = Map<unknown, unknown> & {
  getOrInsert?: (key: unknown, value: unknown) => unknown;
  getOrInsertComputed?: (key: unknown, fn: (key: unknown) => unknown) => unknown;
};

type BytesExtra = {
  toHex?: () => string;
  toBase64?: () => string;
};

type PromiseExtra = {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};

export function installPdfJsPolyfills(g: typeof globalThis = globalThis) {
  const mapProto = g.Map?.prototype as unknown as MapUpsert | undefined;
  if (mapProto && typeof mapProto.getOrInsertComputed !== "function") {
    Object.defineProperty(mapProto, "getOrInsertComputed", {
      value(this: Map<unknown, unknown>, key: unknown, callbackFn: (key: unknown) => unknown) {
        if (this.has(key)) return this.get(key);
        const value = callbackFn(key);
        this.set(key, value);
        return value;
      },
      writable: true,
      configurable: true,
    });
  }
  if (mapProto && typeof mapProto.getOrInsert !== "function") {
    Object.defineProperty(mapProto, "getOrInsert", {
      value(this: Map<unknown, unknown>, key: unknown, defaultValue: unknown) {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
      },
      writable: true,
      configurable: true,
    });
  }

  const u8 = g.Uint8Array?.prototype as unknown as BytesExtra | undefined;
  if (u8 && typeof u8.toHex !== "function") {
    Object.defineProperty(u8, "toHex", {
      value(this: Uint8Array) {
        let hex = "";
        for (let i = 0; i < this.length; i += 1) hex += this[i].toString(16).padStart(2, "0");
        return hex;
      },
      writable: true,
      configurable: true,
    });
  }
  if (u8 && typeof u8.toBase64 !== "function") {
    Object.defineProperty(u8, "toBase64", {
      value(this: Uint8Array) {
        let binary = "";
        for (let i = 0; i < this.length; i += 1) binary += String.fromCharCode(this[i]);
        return btoa(binary);
      },
      writable: true,
      configurable: true,
    });
  }

  const PromiseCtor = g.Promise as unknown as PromiseConstructor & PromiseExtra;
  if (typeof PromiseCtor.withResolvers !== "function") {
    PromiseCtor.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}

installPdfJsPolyfills();
