import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import unittest
import urllib.error

spec = importlib.util.spec_from_file_location('notify', Path(__file__).with_name('notify-deploy.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NotificationTests(unittest.TestCase):
    def test_exact_body_signed_and_retry_is_identical(self):
        requests = []
        class Response:
            status = 202
            def __enter__(self): return self
            def __exit__(self, *args): pass
        def send(request, timeout):
            requests.append(request)
            if len(requests) == 1:
                raise urllib.error.URLError('temporary')
            return Response()
        payload = {'repository': 'ianphil/genesis-durable', 'runId': '123'}
        module.notify('https://example.test/deploy', 'private-test', payload, open_url=send, sleep=lambda _: None)
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0].data, requests[1].data)
        self.assertEqual(json.loads(requests[0].data), payload)
        self.assertEqual(requests[0].get_header('X-hub-signature-256'), 'sha256=' + hmac.new(b'private-test', requests[0].data, hashlib.sha256).hexdigest())

    def test_rejection_not_retried_and_http_disallowed(self):
        calls = []
        def reject(request, timeout):
            calls.append(request)
            raise urllib.error.HTTPError(request.full_url, 403, 'rejected', {}, None)
        with self.assertRaises(RuntimeError):
            module.notify('https://example.test/deploy', 'test', {}, open_url=reject)
        self.assertEqual(len(calls), 1)
        with self.assertRaises(ValueError):
            module.notify('http://example.test/deploy', 'test', {})

    def test_exhausted_retries_fail(self):
        calls = []
        def fail(request, timeout):
            calls.append(request)
            raise TimeoutError()
        with self.assertRaises(RuntimeError):
            module.notify('https://example.test/deploy', 'test', {}, open_url=fail, sleep=lambda _: None)
        self.assertEqual(len(calls), 4)


if __name__ == '__main__':
    unittest.main()
