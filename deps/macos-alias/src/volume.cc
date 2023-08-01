#define NAPI_VERSION 8

#define DECLARE_NODE_API_PROPERTY(name, func)                            \
  { (name), NULL, (func), NULL, NULL, NULL, napi_default, NULL }

#include <node_api.h>

#ifdef __APPLE__

#include "impl-apple.cc"


#else
#error This platform is not implemented yet
#endif

static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor properties[] = {
            DECLARE_NODE_API_PROPERTY("getVolumeName", MethodGetVolumeName)
    };
    napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
