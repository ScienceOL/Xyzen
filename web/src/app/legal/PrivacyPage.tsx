import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

const COMPANY_EN = "Miracle Story (Shanghai) Intelligent Technology Co., Ltd.";
const COMPANY_ZH =
  "\u5947\u8ff9\u7269\u8bed\uff08\u4e0a\u6d77\uff09\u667a\u80fd\u79d1\u6280\u6709\u9650\u516c\u53f8";
const LAST_UPDATED = "2025-01-01";

function EnPrivacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="meta">Last updated: {LAST_UPDATED}</p>

      <h2>1. Introduction</h2>
      <p>
        {COMPANY_EN} (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;)
        operates the Xyzen platform. This Privacy Policy explains how we
        collect, use, store, and protect your personal information.
      </p>

      <h2>2. Information We Collect</h2>
      <p>We may collect the following types of information:</p>
      <ul>
        <li>
          <strong>Account Information</strong>: name, email address, and profile
          details you provide during registration
        </li>
        <li>
          <strong>Usage Data</strong>: interactions with the Service, chat
          history, agent configurations, and uploaded files
        </li>
        <li>
          <strong>Device Information</strong>: browser type, operating system,
          IP address, and device identifiers
        </li>
        <li>
          <strong>Payment Information</strong>: billing details processed by
          third-party payment providers
        </li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <p>We use collected information to:</p>
      <ul>
        <li>Provide, maintain, and improve the Service</li>
        <li>Process transactions and manage your account</li>
        <li>Send service notifications and updates</li>
        <li>
          Detect, prevent, and address technical issues or security threats
        </li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>4. Data Storage and Security</h2>
      <p>
        Your data is stored on secure servers. We implement industry-standard
        security measures including encryption, access controls, and regular
        security audits to protect your information. However, no method of
        electronic storage is 100% secure.
      </p>

      <h2>5. Data Sharing</h2>
      <p>
        We do not sell your personal information. We may share information with:
      </p>
      <ul>
        <li>
          <strong>Service Providers</strong>: third-party companies that help us
          operate the Service (hosting, analytics, payment processing)
        </li>
        <li>
          <strong>LLM Providers</strong>: conversation content may be sent to AI
          model providers (OpenAI, Anthropic, etc.) for processing, subject to
          their respective privacy policies
        </li>
        <li>
          <strong>Legal Requirements</strong>: when required by law, regulation,
          or legal process
        </li>
      </ul>

      <h2>6. Cookies and Tracking</h2>
      <p>
        We use cookies and similar technologies to maintain sessions, remember
        preferences, and analyze usage patterns. You can control cookie settings
        through your browser preferences.
      </p>

      <h2>7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access, correct, or delete your personal information</li>
        <li>Export your data in a portable format</li>
        <li>Withdraw consent for data processing</li>
        <li>Object to certain uses of your information</li>
      </ul>
      <p>
        To exercise these rights, contact us at{" "}
        <a href="mailto:support@xyzen.ai">support@xyzen.ai</a>.
      </p>

      <h2>8. Children&apos;s Privacy</h2>
      <p>
        The Service is not intended for users under the age of 14. We do not
        knowingly collect personal information from children. If you believe a
        child has provided us with personal data, please contact us.
      </p>

      <h2>9. International Data Transfers</h2>
      <p>
        Your information may be transferred to and processed in countries other
        than your country of residence. We ensure appropriate safeguards are in
        place for such transfers.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you
        of significant changes by posting the updated policy on this page.
        Continued use of the Service constitutes acceptance of the revised
        policy.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy, please contact us
        at <a href="mailto:support@xyzen.ai">support@xyzen.ai</a>.
      </p>
    </>
  );
}

function ZhPrivacy() {
  return (
    <>
      <h1>{"\u9690\u79c1\u653f\u7b56"}</h1>
      <p className="meta">
        {"\u6700\u540e\u66f4\u65b0\uff1a"}
        {LAST_UPDATED}
      </p>

      <h2>1. {"\u5f15\u8a00"}</h2>
      <p>
        {COMPANY_ZH}
        {
          "\uff08\u201c\u516c\u53f8\u201d\u3001\u201c\u6211\u4eec\u201d\uff09\u8fd0\u8425 Xyzen \u5e73\u53f0\u3002\u672c\u9690\u79c1\u653f\u7b56\u8bf4\u660e\u6211\u4eec\u5982\u4f55\u6536\u96c6\u3001\u4f7f\u7528\u3001\u5b58\u50a8\u548c\u4fdd\u62a4\u60a8\u7684\u4e2a\u4eba\u4fe1\u606f\u3002"
        }
      </p>

      <h2>2. {"\u6211\u4eec\u6536\u96c6\u7684\u4fe1\u606f"}</h2>
      <p>
        {
          "\u6211\u4eec\u53ef\u80fd\u6536\u96c6\u4ee5\u4e0b\u7c7b\u578b\u7684\u4fe1\u606f\uff1a"
        }
      </p>
      <ul>
        <li>
          <strong>{"\u8d26\u6237\u4fe1\u606f"}</strong>
          {
            "\uff1a\u6ce8\u518c\u65f6\u63d0\u4f9b\u7684\u59d3\u540d\u3001\u7535\u5b50\u90ae\u7bb1\u548c\u4e2a\u4eba\u8d44\u6599"
          }
        </li>
        <li>
          <strong>{"\u4f7f\u7528\u6570\u636e"}</strong>
          {
            "\uff1a\u4e0e\u670d\u52a1\u7684\u4ea4\u4e92\u3001\u804a\u5929\u8bb0\u5f55\u3001Agent \u914d\u7f6e\u548c\u4e0a\u4f20\u7684\u6587\u4ef6"
          }
        </li>
        <li>
          <strong>{"\u8bbe\u5907\u4fe1\u606f"}</strong>
          {
            "\uff1a\u6d4f\u89c8\u5668\u7c7b\u578b\u3001\u64cd\u4f5c\u7cfb\u7edf\u3001IP \u5730\u5740\u548c\u8bbe\u5907\u6807\u8bc6\u7b26"
          }
        </li>
        <li>
          <strong>{"\u652f\u4ed8\u4fe1\u606f"}</strong>
          {
            "\uff1a\u7531\u7b2c\u4e09\u65b9\u652f\u4ed8\u63d0\u4f9b\u5546\u5904\u7406\u7684\u8d26\u5355\u8be6\u60c5"
          }
        </li>
      </ul>

      <h2>3. {"\u4fe1\u606f\u4f7f\u7528\u65b9\u5f0f"}</h2>
      <p>
        {
          "\u6211\u4eec\u4f7f\u7528\u6536\u96c6\u7684\u4fe1\u606f\u7528\u4e8e\uff1a"
        }
      </p>
      <ul>
        <li>
          {"\u63d0\u4f9b\u3001\u7ef4\u62a4\u548c\u6539\u8fdb\u670d\u52a1"}
        </li>
        <li>
          {"\u5904\u7406\u4ea4\u6613\u548c\u7ba1\u7406\u60a8\u7684\u8d26\u6237"}
        </li>
        <li>{"\u53d1\u9001\u670d\u52a1\u901a\u77e5\u548c\u66f4\u65b0"}</li>
        <li>
          {
            "\u68c0\u6d4b\u3001\u9632\u6b62\u548c\u89e3\u51b3\u6280\u672f\u95ee\u9898\u6216\u5b89\u5168\u5a01\u80c1"
          }
        </li>
        <li>{"\u9075\u5b88\u6cd5\u5f8b\u4e49\u52a1"}</li>
      </ul>

      <h2>4. {"\u6570\u636e\u5b58\u50a8\u4e0e\u5b89\u5168"}</h2>
      <p>
        {
          "\u60a8\u7684\u6570\u636e\u5b58\u50a8\u5728\u5b89\u5168\u7684\u670d\u52a1\u5668\u4e0a\u3002\u6211\u4eec\u5b9e\u65bd\u884c\u4e1a\u6807\u51c6\u7684\u5b89\u5168\u63aa\u65bd\uff0c\u5305\u62ec\u52a0\u5bc6\u3001\u8bbf\u95ee\u63a7\u5236\u548c\u5b9a\u671f\u5b89\u5168\u5ba1\u8ba1\uff0c\u4ee5\u4fdd\u62a4\u60a8\u7684\u4fe1\u606f\u3002\u4f46\u6ca1\u6709\u4efb\u4f55\u7535\u5b50\u5b58\u50a8\u65b9\u6cd5\u662f 100% \u5b89\u5168\u7684\u3002"
        }
      </p>

      <h2>5. {"\u6570\u636e\u5171\u4eab"}</h2>
      <p>
        {
          "\u6211\u4eec\u4e0d\u4f1a\u51fa\u552e\u60a8\u7684\u4e2a\u4eba\u4fe1\u606f\u3002\u6211\u4eec\u53ef\u80fd\u4e0e\u4ee5\u4e0b\u65b9\u5171\u4eab\u4fe1\u606f\uff1a"
        }
      </p>
      <ul>
        <li>
          <strong>{"\u670d\u52a1\u63d0\u4f9b\u5546"}</strong>
          {
            "\uff1a\u5e2e\u52a9\u6211\u4eec\u8fd0\u8425\u670d\u52a1\u7684\u7b2c\u4e09\u65b9\u516c\u53f8\uff08\u6258\u7ba1\u3001\u5206\u6790\u3001\u652f\u4ed8\u5904\u7406\uff09"
          }
        </li>
        <li>
          <strong>{"LLM \u63d0\u4f9b\u5546"}</strong>
          {
            "\uff1a\u5bf9\u8bdd\u5185\u5bb9\u53ef\u80fd\u53d1\u9001\u81f3 AI \u6a21\u578b\u63d0\u4f9b\u5546\uff08OpenAI\u3001Anthropic \u7b49\uff09\u8fdb\u884c\u5904\u7406\uff0c\u53d7\u5176\u5404\u81ea\u9690\u79c1\u653f\u7b56\u7ea6\u675f"
          }
        </li>
        <li>
          <strong>{"\u6cd5\u5f8b\u8981\u6c42"}</strong>
          {
            "\uff1a\u5f53\u6cd5\u5f8b\u3001\u6cd5\u89c4\u6216\u6cd5\u5f8b\u7a0b\u5e8f\u8981\u6c42\u65f6"
          }
        </li>
      </ul>

      <h2>6. Cookie {"\u4e0e\u8ddf\u8e2a"}</h2>
      <p>
        {
          "\u6211\u4eec\u4f7f\u7528 Cookie \u548c\u7c7b\u4f3c\u6280\u672f\u6765\u7ef4\u62a4\u4f1a\u8bdd\u3001\u8bb0\u4f4f\u504f\u597d\u8bbe\u7f6e\u548c\u5206\u6790\u4f7f\u7528\u6a21\u5f0f\u3002\u60a8\u53ef\u4ee5\u901a\u8fc7\u6d4f\u89c8\u5668\u504f\u597d\u8bbe\u7f6e\u63a7\u5236 Cookie \u8bbe\u7f6e\u3002"
        }
      </p>

      <h2>7. {"\u60a8\u7684\u6743\u5229"}</h2>
      <p>{"\u60a8\u6709\u6743\uff1a"}</p>
      <ul>
        <li>
          {
            "\u8bbf\u95ee\u3001\u66f4\u6b63\u6216\u5220\u9664\u60a8\u7684\u4e2a\u4eba\u4fe1\u606f"
          }
        </li>
        <li>
          {
            "\u4ee5\u53ef\u79fb\u690d\u683c\u5f0f\u5bfc\u51fa\u60a8\u7684\u6570\u636e"
          }
        </li>
        <li>{"\u64a4\u56de\u6570\u636e\u5904\u7406\u7684\u540c\u610f"}</li>
        <li>
          {"\u53cd\u5bf9\u5bf9\u60a8\u4fe1\u606f\u7684\u67d0\u4e9b\u4f7f\u7528"}
        </li>
      </ul>
      <p>
        {"\u8981\u884c\u4f7f\u8fd9\u4e9b\u6743\u5229\uff0c\u8bf7\u901a\u8fc7 "}
        <a href="mailto:support@xyzen.ai">support@xyzen.ai</a>
        {" \u8054\u7cfb\u6211\u4eec\u3002"}
      </p>

      <h2>8. {"\u672a\u6210\u5e74\u4eba\u4fdd\u62a4"}</h2>
      <p>
        {
          "\u672c\u670d\u52a1\u4e0d\u9762\u5411 14 \u5c81\u4ee5\u4e0b\u7684\u7528\u6237\u3002\u6211\u4eec\u4e0d\u4f1a\u6545\u610f\u6536\u96c6\u513f\u7ae5\u7684\u4e2a\u4eba\u4fe1\u606f\u3002\u5982\u679c\u60a8\u8ba4\u4e3a\u672a\u6210\u5e74\u4eba\u5411\u6211\u4eec\u63d0\u4f9b\u4e86\u4e2a\u4eba\u6570\u636e\uff0c\u8bf7\u8054\u7cfb\u6211\u4eec\u3002"
        }
      </p>

      <h2>9. {"\u56fd\u9645\u6570\u636e\u4f20\u8f93"}</h2>
      <p>
        {
          "\u60a8\u7684\u4fe1\u606f\u53ef\u80fd\u4f1a\u88ab\u4f20\u8f93\u5230\u60a8\u5c45\u4f4f\u56fd\u4ee5\u5916\u7684\u56fd\u5bb6\u5e76\u5728\u90a3\u91cc\u5904\u7406\u3002\u6211\u4eec\u786e\u4fdd\u5bf9\u6b64\u7c7b\u4f20\u8f93\u91c7\u53d6\u9002\u5f53\u7684\u4fdd\u969c\u63aa\u65bd\u3002"
        }
      </p>

      <h2>10. {"\u653f\u7b56\u53d8\u66f4"}</h2>
      <p>
        {
          "\u6211\u4eec\u53ef\u80fd\u4f1a\u4e0d\u65f6\u66f4\u65b0\u672c\u9690\u79c1\u653f\u7b56\u3002\u91cd\u5927\u53d8\u66f4\u5c06\u901a\u8fc7\u5728\u672c\u9875\u9762\u53d1\u5e03\u66f4\u65b0\u540e\u7684\u653f\u7b56\u6765\u901a\u77e5\u60a8\u3002\u7ee7\u7eed\u4f7f\u7528\u670d\u52a1\u5373\u8868\u793a\u63a5\u53d7\u4fee\u8ba2\u540e\u7684\u653f\u7b56\u3002"
        }
      </p>

      <h2>11. {"\u8054\u7cfb\u6211\u4eec"}</h2>
      <p>
        {
          "\u5982\u60a8\u5bf9\u672c\u9690\u79c1\u653f\u7b56\u6709\u4efb\u4f55\u7591\u95ee\uff0c\u8bf7\u901a\u8fc7 "
        }
        <a href="mailto:support@xyzen.ai">support@xyzen.ai</a>
        {" \u8054\u7cfb\u6211\u4eec\u3002"}
      </p>
    </>
  );
}

export function PrivacyPage() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === "zh";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <button
          onClick={() => {
            window.location.hash = "";
          }}
          className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {isZh ? "\u8fd4\u56de" : "Back"}
        </button>

        <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:mt-8 prose-h2:text-lg prose-p:text-[13px] prose-p:leading-relaxed prose-li:text-[13px] prose-a:text-indigo-500 prose-a:no-underline hover:prose-a:underline [&_.meta]:text-xs [&_.meta]:text-neutral-400">
          {isZh ? <ZhPrivacy /> : <EnPrivacy />}
        </article>
      </div>
    </div>
  );
}
