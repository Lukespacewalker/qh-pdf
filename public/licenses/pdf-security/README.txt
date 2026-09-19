PDF password processing third-party notices

pdfstudio 0.4.0 by Fayaz Ahmed: Apache-2.0.
https://github.com/fayazara/pdfstudio
Published npm gitHead: c5c1f2d9f378199d1e2d333dbe4ca20e9ff737ad
The npm WASM matches src/wasm/qpdf.wasm at that upstream commit:
SHA-256 48a6044e2b5abb32295fa1682e26f20338181bb2423b2ab6e8456b7c4a8c9756
This comparison verifies the published artifact, not reproducibility of its build.

QPDF 12.3.2: Apache-2.0, with additional notices in qpdf-NOTICE.md.
https://github.com/qpdf/qpdf/tree/v12.3.2
The WASM runtime reports QPDF version 12.3.2. Upstream builds its native
crypto provider, zlib and libjpeg with Emscripten; runtime glue uses the
platform crypto.getRandomValues for randomness. This is not a security audit.

zlib 1.3.2: zlib license (see zlib-license.txt).
https://github.com/madler/zlib/tree/v1.3.2

libjpeg 9f: IJG license (see LEGAL ISSUES in libjpeg-README.txt).
This software is based in part on the work of the Independent JPEG Group.
https://www.ijg.org/

Emscripten runtime: MIT / University of Illinois/NCSA licenses.
See emscripten-LICENSE.txt.
https://github.com/emscripten-core/emscripten

The zlib and libjpeg versions above are present in the shipped WASM strings.
These files are attribution and license records; the application does not
request the external URLs while processing documents.
