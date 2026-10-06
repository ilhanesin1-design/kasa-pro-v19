function InvoiceModal({
  row,
  branches,
  user,
  onClose,
  onSaved
}: {
  row: InvoiceRow | null;
  branches: ModuleBranch[];
  user: AppOutletContext['user'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const safeRow = row ?? ({ id: '' } as InvoiceRow);
  
  const [saving, setSaving] = useState(false);
  const [branchId, setBranchId] = useState(pick(safeRow, ['branch_id'], user.branchIds[0] || branches[0]?.id || ''));
  const [firma, setFirma] = useState(pick(safeRow, ['firma', 'fatura_adi'], ''));
  const [serial, setSerial] = useState(pick(safeRow, ['seri_no', 'fatura_no'], ''));
  const [content, setContent] = useState(pick(safeRow, ['icerik'], ''));
  const [amount, setAmount] = useState(String(total(safeRow)));
  const [paid, setPaid] = useState(String(Number(row?.odenen ?? 0)));
  const [dateValue, setDateValue] = useState(pick(safeRow, ['tarih'], new Date().toISOString().slice(0, 10)));
  const [due, setDue] = useState(pick(safeRow, ['vade_tarihi'], ''));
  const [note, setNote] = useState(pick(safeRow, ['fatura_notu'], ''));

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide-modal">
        <div className="modal-head">
          <div>
            <div className="eyebrow">FATURA</div>
            <h2>{row ? 'Faturayı düzenle' : 'Yeni fatura'}</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X /></button>
        </div>
        <div className="form-grid">
          <label>Şube
            <select value={branchId} onChange={e => setBranchId(e.target.value)}>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label>Firma<input value={firma} onChange={e => setFirma(e.target.value)} /></label>
          <label>Fatura / seri no<input value={serial} onChange={e => setSerial(e.target.value)} /></label>
          <label>Toplam tutar<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>İlk ödeme<input type="number" min="0" step="0.01" value={paid} onChange={e => setPaid(e.target.value)} /></label>
          <label>Tarih<input type="date" value={dateValue} onChange={e => setDateValue(e.target.value)} /></label>
          <label>Vade tarihi<input type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
          <label>İçerik<input value={content} onChange={e => setContent(e.target.value)} /></label>
          <label>Not<textarea value={note} onChange={e => setNote(e.target.value)} /></label>
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Vazgeç</button>
          <button className="primary" disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              if (!branchId || !firma.trim() || !(Number(amount) > 0)) throw new Error('Şube, firma ve geçerli tutar zorunlu.');
              const input = {
                branch_id: branchId,
                firma: firma.trim(),
                seri_no: serial.trim(),
                icerik: content.trim(),
                miktar: Number(amount),
                odenen: Number(paid),
                tarih: dateValue,
                vade_tarihi: due || null,
                fatura_notu: note.trim(),
                fatura_durumu: Number(amount) - Number(paid) <= 0 ? 'Ödendi' : 'Açık'
              };
              if (row) await updateInvoice(row.id, input, user);
              else await createInvoice(input, user);
              onSaved();
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Fatura kaydedilemedi.');
            } finally {
              setSaving(false);
            }
          }}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
```[cite: 4]
