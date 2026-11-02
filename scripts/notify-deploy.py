#!/usr/bin/env python3
"""Request deployment after publishing; acceptance is not deployment completion."""
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPEN_URL = urllib.request.build_opener(NoRedirect()).open


def notify(url, secret, payload, *, open_url=OPEN_URL, sleep=time.sleep):
    if not url.startswith('https://') or not secret:
        raise ValueError('HTTPS endpoint and deployment secret required')
    body = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
    signature = 'sha256=' + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    for attempt in range(4):
        request = urllib.request.Request(url, data=body, headers={
            'Content-Type': 'application/json', 'X-Hub-Signature-256': signature,
        }, method='POST')
        try:
            with open_url(request, timeout=20) as response:
                if response.status != 202:
                    raise RuntimeError('deployment endpoint did not acknowledge queueing')
            return
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504):
                raise RuntimeError(f'deployment request rejected (HTTP {error.code})') from None
        except (urllib.error.URLError, TimeoutError):
            pass
        if attempt < 3:
            sleep(2 ** attempt)
    raise RuntimeError('deployment notification failed after retries')


if __name__ == '__main__':
    try:
        notify(os.environ['DEMIGOD_DEPLOY_URL'], os.environ['DEMIGOD_DEPLOY_SECRET'], {
            'repository': os.environ['GITHUB_REPOSITORY'],
            'revision': os.environ['GITHUB_SHA'],
            'image': 'ghcr.io/ianphil/genesis-durable@' + os.environ['IMAGE_DIGEST'],
            'runId': os.environ['GITHUB_RUN_ID'],
        })
    except Exception:
        raise SystemExit('Deployment notification failed; inspect demigod safely. No deployment completion claimed.')
    print('Deployment queued; this does not confirm deployment completion.')
