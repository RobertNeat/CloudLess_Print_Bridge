/** SHA256 hex digest of an on-SD file, used for the X-Sha256 upload header.
 * Uses mbedtls (bundled with the ESP32 Arduino core -- no new dependency). */
#include "video_service_internal.h"

#include <mbedtls/sha256.h>

namespace video_service_internal
{
bool sha256HexOfFile(const String& filePath, String& hexDigestOut)
{
    File file = SD.open(filePath, FILE_READ);
    if (!file)
        return false;

    mbedtls_sha256_context context;
    mbedtls_sha256_init(&context);
    mbedtls_sha256_starts_ret(&context, 0 /* SHA-256, not SHA-224 */);

    uint8_t buffer[2048];
    bool readFailed = false;
    while (file.available())
    {
        const size_t count = file.read(buffer, sizeof(buffer));
        if (count == 0)
        {
            readFailed = true;
            break;
        }
        mbedtls_sha256_update_ret(&context, buffer, count);
    }
    file.close();

    uint8_t digest[32];
    mbedtls_sha256_finish_ret(&context, digest);
    mbedtls_sha256_free(&context);
    if (readFailed)
        return false;

    char hex[65];
    for (size_t index = 0; index < sizeof(digest); ++index)
        snprintf(hex + index * 2, 3, "%02x", digest[index]);
    hexDigestOut = String(hex);
    return true;
}

}  // namespace video_service_internal
