/*
 * Project note: Home Page is a top-level page in the public or portal experience.
 * Keep the page copy short, practical, and connected to the backend service that owns the real data.
 */
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import SectionCard from "../components/SectionCard";
import { SERVICE_MODULES } from "../data/serviceModules";

function HomePage() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      return;
    }

    const sectionId = location.hash.replace("#", "");
    const targetSection = document.getElementById(sectionId);

    if (!targetSection) {
      return;
    }

    window.requestAnimationFrame(() => {
      targetSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [location.hash]);

  return (
    <div className="stack-lg">
      <section className="hero hero-home">
        <div className="hero-copy">
          <span className="eyebrow">Smart Tole Platform</span>
          <h2>One portal for residents and community teams.</h2>
          <p>
            Send complaints, read notices, check dustbins, and manage daily community work from one place.
          </p>
          <div className="button-row">
            <Link className="button" to="/resident/register">Resident Registration</Link>
            <a className="button button-secondary" href="#features">View Features</a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-image-card">
            <div className="hero-image-frame">
              <img
                alt="Nepali village with homes, hills, and trees"
                src="https://upload.wikimedia.org/wikipedia/commons/0/02/Nepali_village_in_hills.jpg"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="home-impact">
        <SectionCard title="Platform Highlights" subtitle="Main tools">
          <div className="impact-stats">
            <div>
              <strong>5</strong>
              <span>Service Areas</span>
            </div>
            <div>
              <strong>Auto</strong>
              <span>Complaint Routing</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>Dustbin Monitoring</span>
            </div>
          </div>
        </SectionCard>
        <div className="home-notice-card">
          <span className="material-symbols-outlined">campaign</span>
          <h3>Resident Notice Board</h3>
          <p>Residents can read published notices, updates, and alerts from the portal.</p>
          <Link to="/resident/login">Open Resident Portal</Link>
        </div>
      </section>

      <section className="home-features" id="features">
        <div className="feature-band-copy center-copy">
          <h3>Services available in Smart Tole</h3>
          <p>Choose a service area and continue.</p>
        </div>
        <div className="feature-band-grid">
          {SERVICE_MODULES.map((module) => (
            <article key={module.id} className="feature-tile feature-card">
              <div className="feature-card-top">
                <span className="feature-icon material-symbols-outlined">{module.icon}</span>
                <span className="feature-card-kicker">Service Area</span>
              </div>
              <strong>{module.title}</strong>
              <p>{module.description}</p>
              <div className="feature-card-foot">
                <Link
                  className="feature-card-link feature-card-pill-link"
                  to="/resident/login"
                >
                  {Array.from(new Set((module.categoryOptions || []).map((option) => option.label))).join(", ")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-showcase" id="about">
        <div className="home-showcase-copy">
          <h3>What you can do</h3>
          <div className="stack-sm">
            <div className="action-row">
              <span className="action-index">01</span>
              <div>
                <strong>Report issues quickly</strong>
                <p className="muted-text">Send streetlight, water, road, sanitation, or safety complaints from one portal.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">02</span>
              <div>
                <strong>Route complaints clearly</strong>
                <p className="muted-text">Committee users and admin can review the right complaints faster.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">03</span>
              <div>
                <strong>Track bins and notices</strong>
                <p className="muted-text">Follow device status, dustbin updates, and published notices in one system.</p>
              </div>
            </div>
            <div className="action-row">
              <span className="action-index">04</span>
              <div>
                <strong>Review reports faster</strong>
                <p className="muted-text">Use deadline checks, complaint reports, and warning bins for daily decisions.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="showcase-card">
          <div className="showcase-window-bar">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="showcase-window-body">
            <div className="showcase-block large"></div>
            <div className="showcase-block large"></div>
            <div className="showcase-row">
              <div className="showcase-line"></div>
              <div className="showcase-pill"></div>
            </div>
            <div className="showcase-row">
              <div className="showcase-line short"></div>
              <div className="showcase-pill warning"></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
