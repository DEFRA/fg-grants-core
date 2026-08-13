#!/bin/bash

set -e

# How many times a message may be received before it is moved to the DLQ.
# Defaults to 1 (a single failed receive dead-letters). 
# Set MAX_READS=2 in aws.env when you want to peek at the queues 
MAX_READS="${MAX_READS:-1}"

function create_topic() {
  local topic_name=$1
  # Two masking hazards, so every command-substitution assignment carries an
  # explicit `|| return`:
  #   1. `local topic_arn=$(...)` returns the status of `local` (always 0).
  #   2. These functions are also called from within $(...) (see the *_and_queue
  #      wrappers), and bash runs a function body with `set -e` disabled when the
  #      function executes in a context where -e is ignored - so the inner
  #      awslocal failure would otherwise fall through to the final `echo`, which
  #      returns 0. `|| return` propagates the failure in every calling context.
  local topic_arn
  topic_arn=$(awslocal sns create-topic \
	  --name $topic_name \
	  --attributes '{ "FifoTopic":"true","ContentBasedDeduplication":"true"}' \
	  --query "TopicArn" \
	  --output text) || return
  echo $topic_arn
}

function create_standard_topic() {
  local topic_name=$1
  local topic_arn
  topic_arn=$(awslocal sns create-topic \
	  --name $topic_name \
	  --query "TopicArn" \
	  --output text) || return
  echo $topic_arn
}

function create_queue() {
  local queue_name=$1
  local base="${queue_name%%.fifo}"
  local dlq_url
  dlq_url=$(
    awslocal sqs create-queue \
    --queue-name "$base-dead-letter-queue.fifo" \
    --attributes '{ "FifoQueue":"true", "ContentBasedDeduplication":"true" }' \
    --query "QueueUrl" --output text
  ) || return

  local dlq_arn
  dlq_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $dlq_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  ) || return

  # Create the queue with DLQ attached
  local queue_url
  queue_url=$(
    awslocal sqs create-queue \
      --queue-name $queue_name \
      --attributes '{ "FifoQueue":"true", "ContentBasedDeduplication":"true", "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$dlq_arn'\",\"maxReceiveCount\":\"'$MAX_READS'\"}" }' \
      --query "QueueUrl" \
      --output text
  ) || return

  local queue_arn
  queue_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $queue_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  ) || return

  echo $queue_arn
}

function create_standard_queue() {
  local queue_name=$1
  # Standard source queue with a standard DLQ (source and DLQ types must match).
  local dlq_url
  dlq_url=$(
    awslocal sqs create-queue \
      --queue-name "$queue_name-dead-letter-queue" \
      --query "QueueUrl" --output text
  ) || return

  local dlq_arn
  dlq_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $dlq_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  ) || return

  # Create the queue with DLQ attached
  local queue_url
  queue_url=$(
    awslocal sqs create-queue \
      --queue-name $queue_name \
      --attributes '{ "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$dlq_arn'\",\"maxReceiveCount\":\"'$MAX_READS'\"}" }' \
      --query "QueueUrl" \
      --output text
  ) || return

  local queue_arn
  queue_arn=$(
    awslocal sqs get-queue-attributes \
      --queue-url $queue_url \
      --attribute-name "QueueArn" \
      --query "Attributes.QueueArn" \
      --output text
  ) || return

  echo $queue_arn
}

function subscribe_queue_to_topic() {
  local topic_arn=$1
  local queue_arn=$2

  awslocal sns subscribe --topic-arn $topic_arn --protocol sqs --notification-endpoint $queue_arn --attributes '{ "RawMessageDelivery": "true" }'
}

function create_topic_and_queue() {
  local topic_name=$1
  local queue_name=$2

  local topic_arn
  topic_arn=$(create_topic $topic_name) || return
  local queue_arn
  queue_arn=$(create_queue $queue_name) || return

  subscribe_queue_to_topic $topic_arn $queue_arn
}

function create_standard_topic_and_queue() {
  local topic_name=$1
  local queue_name=$2

  local topic_arn
  topic_arn=$(create_standard_topic $topic_name) || return
  local queue_arn
  queue_arn=$(create_standard_queue $queue_name) || return

  subscribe_queue_to_topic $topic_arn $queue_arn
}

# S3 bucket for config broker
awslocal s3 mb s3://configs-bucket 2>/dev/null || true

# Every job is backgrounded to create resources in parallel, and each PID is
# collected so failures can be waited on individually. A bare `wait` always
# returns 0 regardless of what the jobs did, so `set -e` would not catch a
# failed create and this script would exit 0 with resources missing. Floci
# aborts startup and shuts down when an init script exits non-zero, so
# propagating the failure turns a silently half-built emulator into a container
# that refuses to start and says why.
pids=()

create_topic_and_queue "cw__sns__case_status_updated_fifo.fifo" "gas__sqs__update_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__update_agreement_status_fifo.fifo" "update_agreement_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "agreement_status_updated_fifo.fifo" "gas__sqs__update_agreement_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__grant_application_created_fifo.fifo" "gas__sqs__handle_grant_application_created_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__application_status_updated_fifo.fifo" "gas__sqs__application_status_updated_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__create_new_case_fifo.fifo" "cw__sqs__create_new_case_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__update_case_status_fifo.fifo" "cw__sqs__update_status_fifo.fifo" & pids+=($!)
create_topic_and_queue "gas__sns__create_agreement_fifo.fifo" "create_agreement_fifo.fifo" & pids+=($!)
# create_topic "gas__sns__update_agreement_status_fifo.fifo" &


# create_standard_topic "gas__sns__audit_topic_arn" &
# sqs queue names on the audit topics are for debugging/inspection only
create_standard_topic_and_queue "gas__sns__audit_topic_arn" "fcp_audit_fg_gas_backend" & pids+=($!)
create_standard_topic_and_queue "cw__sns__audit_topic_arn" "fcp_audit_fg_cw_backend" & pids+=($!)

# agreements-api
create_standard_topic "fcp_audit_farming_grants_agreements_api" & pids+=($!)
create_standard_topic "fcp_audit_farming_grants_agreements_ui" & pids+=($!)
create_standard_topic "fcp_audit_farming_grants_agreements_pdf" & pids+=($!)
create_standard_topic "fcp_audit_grants_payment_service" & pids+=($!)
create_topic_and_queue "agreement_status_updated_fifo.fifo" "create_agreement_pdf_fifo.fifo" & pids+=($!)
# create_topic_and_queue "grant_application_approved_fifo.fifo" "create_agreement_fifo.fifo" &
create_topic_and_queue "gas__sns__update_agreement_status_fifo.fifo" "update_agreement_fifo.fifo" & pids+=($!)
create_topic_and_queue "create_payment.fifo" "gps__sqs__create_payment.fifo" & pids+=($!)
create_topic_and_queue "cancel_payment.fifo" "gps__sqs__cancel_payment.fifo" & pids+=($!)
create_topic "agreement_status_updated_fifo.fifo" & pids+=($!)

# Config broker: input queue + fan-out topic to GAS and CW subscriber queues
create_standard_queue "gfr__sqs___config_input" & pids+=($!)
create_standard_topic_and_queue "gfr__sns___config_update" "gas__sqs__config_version_updated" & pids+=($!)
create_standard_topic_and_queue "gfr__sns___config_update" "cw__sqs__config_version_updated" & pids+=($!)

for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    echo "SNS/SQS setup failed (pid $pid)" >&2
    exit 1
  fi
done


echo "SNS/SQS ready"

