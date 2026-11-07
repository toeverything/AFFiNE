import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Textarea } from '@affine/admin/components/ui/textarea';
import {
  type AdminPaymentLookupInput,
  AdminPaymentPlanFamily,
  type AdminPaymentReconciliationQuery,
  adminPaymentReconciliationQuery,
  AdminPaymentResolutionStatus,
  type ReconcileAdminPaymentInput,
  type ReconcileAdminPaymentMutation,
  reconcileAdminPaymentMutation,
} from '@affine/graphql';
import { XIcon } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { DiscardChanges } from '../../../components/shared/discard-changes';
import { useMutation } from '../../../use-mutation';
import { useQuery } from '../../../use-query';
import { useRightPanel } from '../../panel/context';
import type { UserType } from '../schema';

type PaymentCase =
  AdminPaymentReconciliationQuery['adminPaymentReconciliation'][number];
type PaymentResolution = ReconcileAdminPaymentMutation['reconcileAdminPayment'];

type ReviewTarget = Pick<PaymentCase, 'userId' | 'planFamily'> & {
  attempt?: PaymentCase['attempts'][number];
};

const planNames = {
  [AdminPaymentPlanFamily.Pro]: 'Pro',
  [AdminPaymentPlanFamily.AI]: 'AI',
};

const pendingReasons: Record<string, string> = {
  multiple_sources: 'Multiple sources can still charge or grant access.',
  attempt_unverified: 'The provider has not confirmed the attempt outcome.',
  provider_unverified: 'The provider evidence is incomplete.',
};

function PaymentDetail({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{value}</dd>
    </div>
  );
}

function PaymentCaseCard({
  paymentCase,
  onReview,
}: {
  paymentCase: PaymentCase;
  onReview: (target: ReviewTarget) => void;
}) {
  const {
    userId,
    planFamily,
    conflicted,
    boundProviderNamespace,
    boundSourceIdentity,
    sources,
    attempts,
  } = paymentCase;
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{planNames[planFamily]}</h3>
        {conflicted && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReview({ userId, planFamily })}
          >
            Review conflict
          </Button>
        )}
      </div>
      <dl className="space-y-1 text-xs">
        <PaymentDetail label="Account" value={userId} />
        <PaymentDetail label="Conflict" value={conflicted ? 'Open' : 'None'} />
        <PaymentDetail
          label="Bound source"
          value={boundSourceIdentity ?? 'None'}
        />
        <PaymentDetail label="Bound namespace" value={boundProviderNamespace} />
      </dl>
      {sources.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Payment sources</h4>
          {sources.map(source => (
            <dl
              key={source.id}
              className="space-y-1 rounded-md bg-muted/50 p-2 text-xs"
            >
              <PaymentDetail label="Provider" value={source.provider} />
              <PaymentDetail
                label="Namespace"
                value={source.providerNamespace}
              />
              <PaymentDetail label="Source" value={source.sourceIdentity} />
              <PaymentDetail label="Status" value={source.status} />
              <PaymentDetail
                label="Customer"
                value={source.externalCustomerId}
              />
              <PaymentDetail
                label="Subscription"
                value={source.externalSubscriptionId}
              />
              <PaymentDetail label="Reference" value={source.externalRef} />
            </dl>
          ))}
        </div>
      )}
      {attempts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">
            Attempts awaiting verification
          </h4>
          {attempts.map(attempt => (
            <div
              key={attempt.id}
              className="space-y-2 rounded-md bg-muted/50 p-2"
            >
              <dl className="space-y-1 text-xs">
                <PaymentDetail label="Attempt" value={attempt.id} />
                <PaymentDetail label="Provider" value={attempt.provider} />
                <PaymentDetail
                  label="Namespace"
                  value={attempt.providerNamespace}
                />
                <PaymentDetail label="Status" value={attempt.status} />
                <PaymentDetail label="Product" value={attempt.productId} />
                <PaymentDetail
                  label="Transaction"
                  value={attempt.transactionId}
                />
                <PaymentDetail
                  label="Checkout session"
                  value={attempt.sessionId}
                />
              </dl>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReview({ userId, planFamily, attempt })}
              >
                Review attempt
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ResolvePaymentForm({
  target,
  onCancel,
  onResult,
}: {
  target: ReviewTarget;
  onCancel: () => void;
  onResult: (result: PaymentResolution) => void;
}) {
  const { setHasDirtyChanges } = useRightPanel();
  const [evidence, setEvidence] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const { trigger, isMutating, error } = useMutation({
    mutation: reconcileAdminPaymentMutation,
  });
  const request = useRef<ReconcileAdminPaymentInput | null>(null);
  const fieldId = useId();

  useEffect(() => {
    setHasDirtyChanges(!!(evidence.trim() || transactionId.trim()));
    return () => setHasDirtyChanges(false);
  }, [evidence, setHasDirtyChanges, transactionId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidence.trim() || isMutating) return;

    const reason = evidence.trim();
    const transaction = transactionId.trim() || undefined;
    if (
      request.current?.evidence !== reason ||
      request.current.transactionId !== transaction
    ) {
      request.current = {
        userId: target.userId,
        planFamily: target.planFamily,
        requestId: crypto.randomUUID(),
        evidence: reason,
        attemptId: target.attempt?.id,
        transactionId: transaction,
      };
    }
    trigger({ input: request.current })
      .then(response => onResult(response.reconcileAdminPayment))
      .catch(() => undefined);
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={submit}
    >
      <h3 className="font-medium">
        {planNames[target.planFamily]} {target.attempt ? 'attempt' : 'conflict'}
      </h3>
      <dl className="space-y-1 text-xs">
        <PaymentDetail label="Account" value={target.userId} />
        <PaymentDetail label="Attempt" value={target.attempt?.id} />
      </dl>
      <p className="text-sm text-muted-foreground">
        The provider will be checked again. The case stays open if the evidence
        is inconclusive.
      </p>
      <div className="space-y-1">
        <Label htmlFor={fieldId}>Reason and evidence</Label>
        <Textarea
          id={fieldId}
          value={evidence}
          onChange={event => setEvidence(event.currentTarget.value)}
          maxLength={4000}
          required
          disabled={isMutating}
        />
      </div>
      {target.attempt?.provider === 'revenuecat' && (
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-transaction`}>
            Verified transaction ID (optional)
          </Label>
          <Input
            id={`${fieldId}-transaction`}
            value={transactionId}
            onChange={event => setTransactionId(event.currentTarget.value)}
            maxLength={256}
            disabled={isMutating}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isMutating || !evidence.trim()}>
          {isMutating ? 'Checking provider…' : 'Recheck and resolve'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isMutating}
        >
          Back to cases
        </Button>
      </div>
    </form>
  );
}

export function PaymentReviewPanel({ user }: { user?: UserType }) {
  const { closePanel, setPanelContent, hasDirtyChanges } = useRightPanel();
  const [dismissTarget, setDismissTarget] = useState<'close' | 'back'>();
  const [providerIdentity, setProviderIdentity] = useState('');
  const [planFamily, setPlanFamily] = useState<AdminPaymentPlanFamily>();
  const [filter, setFilter] = useState<AdminPaymentLookupInput | undefined>(
    user ? { userId: user.id } : undefined
  );
  const [target, setTarget] = useState<ReviewTarget>();
  const [result, setResult] = useState<PaymentResolution>();
  const fieldId = useId();

  const { data, error, isValidating, mutate } = useQuery(
    filter && {
      query: adminPaymentReconciliationQuery,
      variables: { input: filter },
    },
    { suspense: false, revalidateOnMount: true, shouldRetryOnError: false }
  );
  const cases = data?.adminPaymentReconciliation;
  const pending = result?.status === AdminPaymentResolutionStatus.Pending;

  function dismiss(action: 'close' | 'back') {
    setDismissTarget(undefined);
    if (action === 'close') {
      closePanel();
      setPanelContent(null);
    } else {
      setTarget(undefined);
    }
  }

  function requestDismiss(action: 'close' | 'back') {
    if (hasDirtyChanges) setDismissTarget(action);
    else dismiss(action);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identity = providerIdentity.trim();
    if (!user && !identity) return;
    setResult(undefined);
    if (
      filter?.userId === user?.id &&
      filter?.planFamily === planFamily &&
      filter?.providerIdentity === (identity || undefined)
    ) {
      mutate().catch(console.error);
      return;
    }
    setFilter({
      userId: user?.id,
      planFamily,
      providerIdentity: identity || undefined,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Close payment review"
          onClick={() => requestDismiss('close')}
        >
          <XIcon size={18} />
        </Button>
        <h2 className="text-sm font-semibold">Payment review</h2>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        {user && (
          <p className="break-all text-sm text-muted-foreground">
            {user.email}
          </p>
        )}
        {target ? (
          <ResolvePaymentForm
            target={target}
            onCancel={() => requestDismiss('back')}
            onResult={response => {
              setResult(response);
              setTarget(undefined);
              mutate().catch(console.error);
            }}
          />
        ) : (
          <>
            <form className="space-y-3" onSubmit={search}>
              <div className="space-y-1">
                <Label htmlFor={fieldId}>Provider identity</Label>
                <Input
                  id={fieldId}
                  value={providerIdentity}
                  onChange={event =>
                    setProviderIdentity(event.currentTarget.value)
                  }
                  placeholder="Customer, subscription, session or transaction ID"
                  maxLength={256}
                  required={!user}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`${fieldId}-family`}>Plan</Label>
                <select
                  id={`${fieldId}-family`}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={planFamily ?? ''}
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setPlanFamily(
                      value === AdminPaymentPlanFamily.Pro ||
                        value === AdminPaymentPlanFamily.AI
                        ? value
                        : undefined
                    );
                  }}
                >
                  <option value="">All plans</option>
                  {Object.entries(planNames).map(([plan, name]) => (
                    <option key={plan} value={plan}>
                      {name}
                    </option>
                  ))}
                </select>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!user && !providerIdentity.trim()}
                >
                  Search
                </Button>
              </div>
            </form>
            {result && (
              <section
                role="status"
                className="space-y-1 rounded-md border border-border p-3 text-sm"
              >
                <p className="font-medium">
                  {pending ? 'Pending verification' : 'Resolved'}
                </p>
                {pending && (
                  <p>
                    {pendingReasons[result.reason ?? ''] ??
                      'The case remains open.'}
                  </p>
                )}
                <dl className="space-y-1 text-xs">
                  <PaymentDetail label="Account" value={result.userId} />
                  <PaymentDetail
                    label="Plan"
                    value={planNames[result.planFamily]}
                  />
                  <PaymentDetail label="Request" value={result.requestId} />
                  <PaymentDetail
                    label="Conflict"
                    value={result.conflicted ? 'Open' : 'None'}
                  />
                  <PaymentDetail
                    label="Attempt status"
                    value={result.attemptStatus}
                  />
                  <PaymentDetail
                    label="Bound source"
                    value={result.boundSourceIdentity ?? 'None'}
                  />
                </dl>
              </section>
            )}
            {isValidating && (
              <p role="status" className="text-sm">
                Loading payment cases…
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            )}
            {!isValidating && !error && cases?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No matching payment cases.
              </p>
            )}
            {!isValidating &&
              !error &&
              cases?.map(paymentCase => (
                <PaymentCaseCard
                  key={`${paymentCase.userId}:${paymentCase.planFamily}`}
                  paymentCase={paymentCase}
                  onReview={selected => {
                    setResult(undefined);
                    setTarget(selected);
                  }}
                />
              ))}
          </>
        )}
      </div>
      <DiscardChanges
        open={!!dismissTarget}
        onOpenChange={open => {
          if (!open) setDismissTarget(undefined);
        }}
        onClose={() => setDismissTarget(undefined)}
        onConfirm={() => {
          if (dismissTarget) dismiss(dismissTarget);
        }}
      />
    </div>
  );
}
