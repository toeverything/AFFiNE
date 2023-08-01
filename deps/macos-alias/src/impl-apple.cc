
#include <Availability.h>

#ifdef __MAC_10_7
#include "impl-apple-lion.cc"
#else
#include "impl-apple-cheetah.cc"
#endif
