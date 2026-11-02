#!/bin/sh
set -eu
# Kernel lock survives exec and releases on process exit/kill. All launchers must
# use this entrypoint; direct library callers still own lifecycle coordination.
case " $* " in
  *" dist/src/provisioner-main.js "*)
    : "${GENESIS_DATA_ROOT:?provisioner data root required}"
    exec flock --no-fork --exclusive --nonblock --conflict-exit-code 73 "$GENESIS_DATA_ROOT/.provisioner.lock" "$@"
    ;;
  *)
    database="${GENESIS_DATABASE:-/state/durable.sqlite}"
    exec flock --no-fork --exclusive --nonblock --conflict-exit-code 73 "$(dirname "$database")/.runtime.lock" "$@"
    ;;
esac
