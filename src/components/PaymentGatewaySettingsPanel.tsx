import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, ShieldAlert, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PAYMENT_GATEWAY_ORDER } from '../lib/constants';
import { mergePaymentGateways, saveAppSettings } from '../lib/firestoreService';
import type { PaymentGatewayConfig, PaymentGatewayId } from '../types';

export const PaymentGatewaySettingsPanel: React.FC = () => {
  const { userRecord, appSettings, refreshSettings } = useAuth();
  const { notify } = useToast();
  const [draft, setDraft] = useState<Record<PaymentGatewayId, PaymentGatewayConfig>>(() =>
    mergePaymentGateways(appSettings.paymentGateways)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(mergePaymentGateways(appSettings.paymentGateways));
  }, [appSettings.paymentGateways]);

  const updateGateway = (id: PaymentGatewayId, patch: Partial<PaymentGatewayConfig>) => {
    setDraft((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }));
  };

  const enabledCount = PAYMENT_GATEWAY_ORDER.filter((id) => draft[id]?.enabled).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord) return;
    setSaving(true);
    try {
      await saveAppSettings(
        { paymentGateways: draft },
        { uid: userRecord.uid, email: userRecord.email, role: userRecord.role }
      );
      await refreshSettings();
      notify(
        'Payment gateways updated',
        `${enabledCount} gateway${enabledCount === 1 ? '' : 's'} currently enabled for customer checkout.`,
        'success'
      );
    } catch (err) {
      notify(
        'Failed to save gateways',
        err instanceof Error ? err.message : 'Unable to save payment gateway settings.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-base text-[#0B1D3A] flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#1D4ED8]" />
              <span>Payment Gateways Control & Configuration</span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Check or uncheck any gateway below to show or hide it at Customer Checkout. Configure public merchant identifiers and sandbox/live mode per provider.
            </p>
          </div>
          <span className="px-3 py-1 rounded-lg bg-slate-100 text-xs font-mono font-semibold text-[#0B1D3A] shrink-0">
            {enabledCount} / {PAYMENT_GATEWAY_ORDER.length} Enabled
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong>Security Policy:</strong> Private API secrets and salts (e.g.{' '}
            <code className="font-mono text-[11px]">RAZORPAY_KEY_SECRET</code>,{' '}
            <code className="font-mono text-[11px]">CASHFREE_SECRET_KEY</code>,{' '}
            <code className="font-mono text-[11px]">EASEBUZZ_SALT</code>,{' '}
            <code className="font-mono text-[11px]">PAYU_MERCHANT_SALT</code>) stay strictly in server{' '}
            <code className="font-mono text-[11px]">process.env</code> variables and are never stored in Firestore or browser code.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PAYMENT_GATEWAY_ORDER.map((id) => {
          const gw = draft[id];
          const isUpiStyle = id === 'gpay' || id === 'upi';

          return (
            <div
              key={id}
              className={`bg-white border rounded-2xl p-5 space-y-4 transition-colors ${
                gw.enabled ? 'border-[#1D4ED8]/40 shadow-xs' : 'border-slate-200 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isUpiStyle ? (
                      <Smartphone className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <CreditCard className="h-4 w-4 text-[#1D4ED8] shrink-0" />
                    )}
                    <h3 className="font-display font-bold text-sm text-[#0B1D3A]">{gw.label}</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{gw.description}</p>
                </div>

                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer shrink-0 hover:bg-slate-100">
                  <input
                    type="checkbox"
                    checked={gw.enabled}
                    onChange={(e) => updateGateway(id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[#1D4ED8]"
                  />
                  <span className="text-xs font-semibold text-[#0B1D3A]">
                    {gw.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Environment Mode</label>
                  <select
                    value={gw.mode}
                    onChange={(e) => updateGateway(id, { mode: e.target.value as 'sandbox' | 'live' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="sandbox">Sandbox / Test (HMAC Verified)</option>
                    <option value="live">Live Production</option>
                  </select>
                </div>

                {!isUpiStyle ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {id === 'razorpay'
                          ? 'Public Key ID'
                          : id === 'cashfree'
                            ? 'Cashfree App ID'
                            : id === 'easebuzz'
                              ? 'Easebuzz Merchant Key'
                              : 'PayU Merchant Key'}
                      </label>
                      <input
                        type="text"
                        value={gw.publicKeyId || ''}
                        onChange={(e) => updateGateway(id, { publicKeyId: e.target.value })}
                        placeholder={id === 'razorpay' ? 'rzp_live_... or rzp_test_...' : 'Public key / App ID'}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Merchant Account ID (Optional Reference)
                      </label>
                      <input
                        type="text"
                        value={gw.merchantId || ''}
                        onChange={(e) => updateGateway(id, { merchantId: e.target.value })}
                        placeholder="Optional merchant reference ID"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Google Pay Merchant ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={gw.merchantId || ''}
                        onChange={(e) => updateGateway(id, { merchantId: e.target.value })}
                        placeholder="BCR2DN..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">UPI ID (VPA) *</label>
                      <input
                        type="text"
                        value={gw.upiId || ''}
                        onChange={(e) => updateGateway(id, { upiId: e.target.value })}
                        placeholder="merchant@okaxis"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payee Display Name</label>
                      <input
                        type="text"
                        value={gw.upiPayeeName || ''}
                        onChange={(e) => updateGateway(id, { upiPayeeName: e.target.value })}
                        placeholder="TapNex Smart Cards"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#0B1D3A] hover:bg-[#132A52] text-white text-sm font-semibold rounded-xl disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>{saving ? 'Saving Gateway Settings...' : 'Save Payment Gateway Settings'}</span>
        </button>
      </div>
    </form>
  );
};
