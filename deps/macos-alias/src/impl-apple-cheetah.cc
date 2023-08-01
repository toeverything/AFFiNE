#include <node_api.h>
#include <Carbon/Carbon.h>
#include <CoreFoundation/CFURL.h>
#include <CoreFoundation/CFString.h>

const char *OSErrDescription(OSErr err) {
    switch (err) {
        case nsvErr:
            return "Volume not found";
        case ioErr:
            return "I/O error.";
        case bdNamErr:
            return "Bad filename or volume name.";
        case mFulErr:
            return "Memory full (open) or file won't fit (load)";
        case tmfoErr:
            return "Too many files open.";
        case fnfErr:
            return "File or directory not found; incomplete pathname.";
        case volOffLinErr:
            return "Volume is offline.";
        case nsDrvErr:
            return "No such drive.";
        case dirNFErr:
            return "Directory not found or incomplete pathname.";
        case tmwdoErr:
            return "Too many working directories open.";
    }

    return "Could not get volume name";
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

    CFStringRef volumePath = CFStringCreateWithCString(NULL, path, kCFStringEncodingUTF8);
    CFURLRef url = CFURLCreateWithFileSystemPath(NULL, volumePath, kCFURLPOSIXPathStyle, true);

    OSErr err;
    FSRef urlFS;
    FSCatalogInfo urlInfo;
    HFSUniStr255 outString;

    if (CFURLGetFSRef(url, &urlFS) == false) {
        napi_throw_error(env, NULL, "Failed to convert URL to file or directory object");
    }

    if ((err = FSGetCatalogInfo(&urlFS, kFSCatInfoVolume, &urlInfo, NULL, NULL, NULL)) != noErr) {
        napi_throw_error(env, NULL, OSErrDescription(err));
    }

    if ((err = FSGetVolumeInfo(urlInfo.volume, 0, NULL, kFSVolInfoNone, NULL, &outString, NULL)) != noErr) {
        napi_throw_error(env, NULL, OSErrDescription(err));
    }

    napi_value result;
    napi_create_string_utf16(env, outString.unicode, outString.length, &result);

    return result;
}
