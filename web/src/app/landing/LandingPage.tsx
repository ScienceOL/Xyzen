import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { StarsBackground } from "@/components/animate-ui/components/backgrounds/stars";
import { RippleButton } from "@/components/animate-ui/components/buttons/ripple";
import { useState } from "react";
import AuthErrorScreen from "@/app/auth/AuthErrorScreen";
import { autoLogin } from "@/core/auth";

export function LandingPage() {
  const { t } = useTranslation();
  const [showLogin, setShowLogin] = useState(false);

  const handleGetStarted = () => {
    setShowLogin(true);
  };

  const handleRetry = () => {
    void autoLogin();
  };

  const handleLearnMore = () => {
    const featuresSection = document.getElementById("features");
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  // If user clicked "Get Started", show the login component
  if (showLogin) {
    return <AuthErrorScreen onRetry={handleRetry} variant="fullscreen" />;
  }

  return (
    <StarsBackground className="min-h-screen">
      {/* Hero Section */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-4xl"
        >
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            {t("landing.hero.title")}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-10">
            {t("landing.hero.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <RippleButton
              onClick={handleGetStarted}
              className="px-8 py-4 text-lg font-semibold rounded-lg"
            >
              {t("landing.hero.cta_primary")}
            </RippleButton>
            <RippleButton
              variant="outline"
              onClick={handleLearnMore}
              className="px-8 py-4 text-lg font-semibold rounded-lg"
            >
              {t("landing.hero.cta_secondary")}
            </RippleButton>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            {t("landing.features.title")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.features.multi_agent.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.features.multi_agent.description")}
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.features.real_time.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.features.real_time.description")}
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.features.mcp.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.features.mcp.description")}
              </p>
            </motion.div>

            {/* Feature 4 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.features.spatial.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.features.spatial.description")}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t("landing.demo.title")}
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t("landing.demo.description")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 md:p-8 shadow-lg">
            <div className="aspect-video bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg flex items-center justify-center">
              <div className="text-center p-8">
                <p className="text-lg mb-4">Demo Preview</p>
                <p className="text-muted-foreground">
                  Visual representation of the Xyzen interface
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            {t("landing.useCases.title")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Use Case 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.useCases.research.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.useCases.research.description")}
              </p>
            </motion.div>

            {/* Use Case 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.useCases.automation.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.useCases.automation.description")}
              </p>
            </motion.div>

            {/* Use Case 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-semibold mb-3">
                {t("landing.useCases.analysis.title")}
              </h3>
              <p className="text-muted-foreground">
                {t("landing.useCases.analysis.description")}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-border">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-muted-foreground">
            © {new Date().getFullYear()} Xyzen. All rights reserved.
          </p>
        </div>
      </footer>
    </StarsBackground>
  );
}
