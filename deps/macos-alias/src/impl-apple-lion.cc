#include <node_api.h>
#include <stdlib.h>
#include <CoreFoundation/CFURL.h>
#include <CoreFoundation/CFString.h>

napi_value MYCFStringGetV8String(napi_env env, CFStringRef aString) {
    if (aString == NULL) {
        return NULL;
    }

    CFIndex length = CFStringGetLength(aString);
    CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8);
    char *buffer = (char *) malloc(maxSize);

    if (!CFStringGetCString(aString, buffer, maxSize, kCFStringEncodingUTF8)) {
        return NULL;
    }

    napi_value result;
    napi_create_string_utf8(env, buffer, NAPI_AUTO_LENGTH, &result);
    free(buffer);

    return result;
}

napi_value MethodGetVolumeName(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    napi_value napi_path = args[0];
    size_t str_len;
    napi_get_value_string_utf8(env, napi_path, NULL, 0, &str_len);
    char *path = (char *) malloc(str_len + 1);
    napi_get_value_string_utf8(env, napi_path, path, str_len + 1, &str_len);

    CFStringRef out;
    CFErrorRef error;

    CFStringRef volumePath = CFStringCreateWithCString(NULL, path, kCFStringEncodingUTF8);
    CFURLRef url = CFURLCreateWithFileSystemPath(NULL, volumePath, kCFURLPOSIXPathStyle, true);

    if (!CFURLCopyResourcePropertyForKey(url, kCFURLVolumeNameKey, &out, &error)) {
        napi_throw_error(env, NULL, (char *) CFErrorCopyDescription(error));
    }

    napi_value result = MYCFStringGetV8String(env, out);
    return result;
}
