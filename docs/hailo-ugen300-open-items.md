# ASUS UGen300 M2 / Hailo Integration Open Items

This file tracks integration details that depend on vendor confirmation or local review-unit validation.

## Redistribution And Packaging

Status: pending ASUS confirmation.

Questions to confirm:

- Can `UGen300_M2_5.3.0_driver_Linux_amd64.zip` be redistributed inside a public Docker image?
- Can the HailoRT runtime, PyHailoRT wheel, and Hailo-10H firmware from ASUS support packages be redistributed through GHCR/Docker Hub?
- If general redistribution is not allowed, is redistribution allowed for a review/demo project image?

Current implementation stance:

- Public CI does not build or publish `clipse-whisper-hailo`; it must be built locally as a private image with licensed Hailo packages.
- Public images do not bake in ASUS support zips or Hailo-10H firmware.
- Users install the host PCIe driver from the ASUS zip with `scripts/install-hailo-ugen300-driver.sh`.
- Users provide HailoRT/PyHailoRT through host mounts or a private image built with their licensed packages.

## ASUS Linux amd64 Driver Package

Known package name:

- `UGen300_M2_5.3.0_driver_Linux_amd64.zip`

Notes:

- The ASUS amd64 package is a zip, not a direct `.deb`.
- The host installer script supports common layouts: packaged deb, vendor install script, DKMS source, or Makefile/Kbuild source.
- Validate the script against the real package contents when the review unit package is available locally.

## Runtime Validation Checklist

- `ls -l /dev/h1x-*`
- `hailortcli scan`
- `curl http://localhost:8000/health`
- `curl -F file=@sample.wav "http://localhost:8000/benchmark?providers=faster-whisper&providers=hailo"`
- Render a vertical short with Hailo VLM focus enabled and confirm crop placement.
