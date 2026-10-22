/**
 * DashboardPreview — a hand-built preview of the CloudNotes dashboard used in
 * the hero. Pure presentation: no interactive behaviour, no fake data claims.
 */

export default function DashboardPreview() {
  return (
    <div className="preview-window" aria-hidden="true">
      <div className="preview-window-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="preview-url">app.cloudnotes.com/dashboard</span>
      </div>

      <div className="preview-body">
        <div className="preview-side">
          <div className="p-nav is-active" />
          <div className="p-nav" />
          <div className="p-nav" />
          <div className="p-nav" style={{ width: '70%' }} />
        </div>

        <div className="preview-main">
          <div className="preview-stat-row">
            <div className="preview-stat">
              <div className="ps-num">24</div>
              <div className="ps-label">Notes</div>
            </div>
            <div className="preview-stat">
              <div className="ps-num">5</div>
              <div className="ps-label">Pinned</div>
            </div>
            <div className="preview-stat">
              <div className="ps-num">6</div>
              <div className="ps-label">Categories</div>
            </div>
          </div>

          <div className="preview-note">
            <span className="p-tag">Work</span>
            <div className="pl title" />
            <div className="pl w-85" />
            <div className="pl w-60" />
          </div>

          <div className="preview-note">
            <span className="p-tag cyan">Projects</span>
            <div className="pl title" style={{ width: '55%' }} />
            <div className="pl w-85" />
            <div className="pl w-40" />
          </div>

          <div className="preview-note">
            <span className="p-tag amber">Ideas</span>
            <div className="pl title" style={{ width: '38%' }} />
            <div className="pl w-60" />
          </div>
        </div>
      </div>
    </div>
  );
}
