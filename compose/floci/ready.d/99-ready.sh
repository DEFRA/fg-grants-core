#!/bin/bash

# Sorts last of all the ready.d scripts mounted into floci, so by the time it
# runs every queue, topic and bucket the stack needs has been created. The
# floci healthcheck waits on this marker rather than on the gateway being up,
# because floci starts serving HTTP before the init hooks have finished.
#
# The marker has its own name because other repos' init scripts write
# /tmp/READY: grants-ui's start.d scripts do, and floci runs every start.d
# script before any ready.d script, so /tmp/READY can appear before these
# resources exist.

set -e

echo READY > /tmp/FG_GRANTS_CORE_READY
