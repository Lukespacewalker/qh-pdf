export function Capabilities() {
  return <section className="capabilities" aria-labelledby="capabilities-title">
    <div className="capabilities-heading"><h2 id="capabilities-title">What you can do here</h2><p>Start with your files. Make the document you need.</p></div>
    <div className="capability-grid">
      <div className="capability"><span className="capability-symbol" aria-hidden="true">＋</span><h3>Bring files together</h3><p>Combine pages from several PDFs and pictures into one PDF.</p></div>
      <div className="capability"><span className="capability-symbol" aria-hidden="true">✓</span><h3>Keep the pages you need</h3><p>Remove unwanted pages. Duplicate any page you need twice.</p></div>
      <div className="capability"><span className="capability-symbol" aria-hidden="true">↶</span><h3>Get everything in order</h3><p>Drag pages or use the arrows to rearrange them. Rotate sideways pages.</p></div>
      <div className="capability"><span className="capability-symbol" aria-hidden="true">▧</span><h3>Turn pictures into a PDF</h3><p>Put JPG, PNG and WebP pictures into a document you can share.</p></div>
    </div>
    <p className="security-note">Working with protected files? Open them with your password, and add a password when you save.</p>
  </section>;
}

