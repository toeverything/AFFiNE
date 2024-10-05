import {
  getDefaultContext as __emnapiGetDefaultContext,
  instantiateNapiModuleSync as __emnapiInstantiateNapiModuleSync,
  WASI as __WASI,
} from '@napi-rs/wasm-runtime';

import __wasmUrl from './affine.wasm32-wasi.wasm?url';

const __wasi = new __WASI({
  version: 'preview1',
});

const __emnapiContext = __emnapiGetDefaultContext();

const __sharedMemory = new WebAssembly.Memory({
  initial: 4000,
  maximum: 65536,
  shared: true,
});

const __wasmFile = await fetch(__wasmUrl).then(res => res.arrayBuffer());

const {
  instance: __napiInstance,
  module: __wasiModule,
  napiModule: __napiModule,
} = __emnapiInstantiateNapiModuleSync(__wasmFile, {
  context: __emnapiContext,
  asyncWorkPoolSize: 4,
  wasi: __wasi,
  onCreateWorker() {
    const worker = new Worker(
      new URL('./wasi-worker-browser.mjs', import.meta.url),
      {
        type: 'module',
      }
    );

    return worker;
  },
  overwriteImports(importObject) {
    importObject.env = {
      ...importObject.env,
      ...importObject.napi,
      ...importObject.emnapi,
      memory: __sharedMemory,
    };
    return importObject;
  },
  beforeInit({ instance }) {
    __napi_rs_initialize_modules(instance);
  },
});

function __napi_rs_initialize_modules(__napiInstance) {
  __napiInstance.exports[
    '__napi_register__AsyncVerifyChallengeResponse_impl_0'
  ]?.();
  __napiInstance.exports['__napi_register__verify_challenge_response_1']?.();
  __napiInstance.exports[
    '__napi_register__AsyncMintChallengeResponse_impl_2'
  ]?.();
  __napiInstance.exports['__napi_register__mint_challenge_response_3']?.();
  __napiInstance.exports['__napi_register__BlobRow_struct_4']?.();
  __napiInstance.exports['__napi_register__UpdateRow_struct_5']?.();
  __napiInstance.exports['__napi_register__InsertRow_struct_6']?.();
  __napiInstance.exports['__napi_register__SqliteConnection_struct_7']?.();
  __napiInstance.exports['__napi_register__ValidationResult_8']?.();
  __napiInstance.exports['__napi_register__SqliteConnection_impl_39']?.();
  __napiInstance.exports['__napi_register__Document_struct_40']?.();
  __napiInstance.exports['__napi_register__Document_impl_46']?.();
  __napiInstance.exports['__napi_register__Page_struct_47']?.();
  __napiInstance.exports['__napi_register__Page_impl_57']?.();
  __napiInstance.exports['__napi_register__Pages_struct_58']?.();
  __napiInstance.exports['__napi_register__Pages_impl_61']?.();
  __napiInstance.exports['__napi_register__Rotation_62']?.();
  __napiInstance.exports['__napi_register__Orientation_63']?.();
  __napiInstance.exports['__napi_register__PagerSize_struct_64']?.();
  __napiInstance.exports['__napi_register__PagerSize_impl_66']?.();
  __napiInstance.exports['__napi_register__ImageData_struct_67']?.();
  __napiInstance.exports['__napi_register__Viewer_struct_68']?.();
  __napiInstance.exports['__napi_register__Viewer_impl_73']?.();
  __napiInstance.exports['__napi_register__Rect_struct_74']?.();
  __napiInstance.exports['__napi_register__Rect_impl_81']?.();
}
export const Document = __napiModule.exports.Document;
export const ImageData = __napiModule.exports.ImageData;
export const Page = __napiModule.exports.Page;
export const PagerSize = __napiModule.exports.PagerSize;
export const Pages = __napiModule.exports.Pages;
export const Rect = __napiModule.exports.Rect;
export const SqliteConnection = __napiModule.exports.SqliteConnection;
export const Viewer = __napiModule.exports.Viewer;
export const mintChallengeResponse = __napiModule.exports.mintChallengeResponse;
export const Orientation = __napiModule.exports.Orientation;
export const Rotation = __napiModule.exports.Rotation;
export const ValidationResult = __napiModule.exports.ValidationResult;
export const verifyChallengeResponse =
  __napiModule.exports.verifyChallengeResponse;
