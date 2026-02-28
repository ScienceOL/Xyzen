import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

const COMPANY_EN = "Miracle Story (Shanghai) Intelligent Technology Co., Ltd.";
const COMPANY_ZH =
  "\u5947\u8ff9\u7269\u8bed\uff08\u4e0a\u6d77\uff09\u667a\u80fd\u79d1\u6280\u6709\u9650\u516c\u53f8";
const LAST_UPDATED = "2025-01-01";

function EnTerms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="meta">Last updated: {LAST_UPDATED}</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using the Xyzen platform (&quot;Service&quot;) operated
        by {COMPANY_EN} (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;),
        you agree to be bound by these Terms of Service (&quot;Terms&quot;). If
        you do not agree, please do not use the Service.
      </p>

      <h2>2. Service Description</h2>
      <p>
        Xyzen is an AI laboratory platform providing multi-agent orchestration,
        real-time chat, document processing, and related services. The Service
        may be updated, modified, or discontinued at any time.
      </p>

      <h2>3. Account Registration</h2>
      <p>
        You must provide accurate and complete information when creating an
        account. You are responsible for maintaining the confidentiality of your
        account credentials and for all activities under your account.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate any applicable laws or regulations</li>
        <li>
          Use the Service for any unlawful, harmful, or fraudulent activities
        </li>
        <li>Attempt to gain unauthorized access to any part of the Service</li>
        <li>
          Interfere with or disrupt the integrity or performance of the Service
        </li>
        <li>
          Reverse engineer, decompile, or disassemble any part of the Service
        </li>
        <li>
          Upload content that infringes third-party intellectual property rights
        </li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <p>
        The Service, including its original content, features, and
        functionality, is owned by {COMPANY_EN} and protected by copyright,
        trademark, and other intellectual property laws. User-generated content
        remains the property of its creator, but you grant us a license to use
        it in connection with the Service.
      </p>

      <h2>6. Fees and Payment</h2>
      <p>
        Certain features of the Service may require payment. Pricing and payment
        terms will be communicated clearly before any charges apply. All fees
        are non-refundable unless otherwise stated.
      </p>

      <h2>7. Disclaimer of Warranties</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;
        without warranties of any kind, either express or implied, including but
        not limited to implied warranties of merchantability, fitness for a
        particular purpose, and non-infringement.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, the Company shall not be liable
        for any indirect, incidental, special, consequential, or punitive
        damages arising out of or related to your use of the Service.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may terminate or suspend your account and access to the Service at
        our sole discretion, without prior notice, for conduct that we believe
        violates these Terms or is harmful to other users, us, or third parties.
      </p>

      <h2>10. Geographic Restrictions</h2>
      <p>
        The Service (xyzen.ai and its related services) is not intended for use
        by residents of the People&apos;s Republic of China (Mainland China). By
        accessing or using our Service, you represent and warrant that you are
        not located in, under the control of, or a national or resident of any
        restricted region, including Mainland China. We reserve the right to
        restrict access from any jurisdiction at our sole discretion.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the
        laws of the Hong Kong Special Administrative Region. Any disputes
        arising from these Terms shall be submitted to the jurisdiction of the
        courts in Hong Kong.
      </p>

      <h2>12. Changes to Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. Continued use of
        the Service after changes constitutes acceptance of the updated Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        If you have any questions about these Terms, please contact us at{" "}
        <a href="mailto:support@xyzen.ai">support@xyzen.ai</a>.
      </p>
    </>
  );
}

function ZhTerms() {
  return (
    <>
      <h1>{"\u7528\u6237\u534f\u8bae"}</h1>
      <p className="meta">
        {"\u6700\u540e\u66f4\u65b0\uff1a"}
        {LAST_UPDATED}
      </p>

      <h2>1. {"\u534f\u8bae\u63a5\u53d7"}</h2>
      <p>
        {"\u8bbf\u95ee\u6216\u4f7f\u7528\u7531"}
        {COMPANY_ZH}
        {
          "\uff08\u201c\u516c\u53f8\u201d\u3001\u201c\u6211\u4eec\u201d\uff09\u8fd0\u8425\u7684 Xyzen \u5e73\u53f0\uff08\u201c\u670d\u52a1\u201d\uff09\uff0c\u5373\u8868\u793a\u60a8\u540c\u610f\u53d7\u672c\u7528\u6237\u534f\u8bae\uff08\u201c\u534f\u8bae\u201d\uff09\u7684\u7ea6\u675f\u3002\u5982\u60a8\u4e0d\u540c\u610f\uff0c\u8bf7\u52ff\u4f7f\u7528\u672c\u670d\u52a1\u3002"
        }
      </p>

      <h2>2. {"\u670d\u52a1\u8bf4\u660e"}</h2>
      <p>
        {
          "Xyzen \u662f\u4e00\u4e2a AI \u5b9e\u9a8c\u5ba4\u5e73\u53f0\uff0c\u63d0\u4f9b\u591a\u667a\u80fd\u4f53\u7f16\u6392\u3001\u5b9e\u65f6\u5bf9\u8bdd\u3001\u6587\u6863\u5904\u7406\u7b49\u670d\u52a1\u3002\u670d\u52a1\u53ef\u80fd\u968f\u65f6\u66f4\u65b0\u3001\u4fee\u6539\u6216\u505c\u6b62\u3002"
        }
      </p>

      <h2>3. {"\u8d26\u6237\u6ce8\u518c"}</h2>
      <p>
        {
          "\u60a8\u5728\u521b\u5efa\u8d26\u6237\u65f6\u5fc5\u987b\u63d0\u4f9b\u51c6\u786e\u5b8c\u6574\u7684\u4fe1\u606f\u3002\u60a8\u6709\u8d23\u4efb\u4fdd\u62a4\u8d26\u6237\u51ed\u8bc1\u7684\u673a\u5bc6\u6027\uff0c\u5e76\u5bf9\u8d26\u6237\u4e0b\u7684\u6240\u6709\u6d3b\u52a8\u8d1f\u8d23\u3002"
        }
      </p>

      <h2>4. {"\u4f7f\u7528\u89c4\u8303"}</h2>
      <p>{"\u60a8\u540c\u610f\u4e0d\u4f1a\uff1a"}</p>
      <ul>
        <li>
          {"\u8fdd\u53cd\u4efb\u4f55\u9002\u7528\u6cd5\u5f8b\u6cd5\u89c4"}
        </li>
        <li>
          {
            "\u5c06\u670d\u52a1\u7528\u4e8e\u4efb\u4f55\u975e\u6cd5\u3001\u6709\u5bb3\u6216\u6b3a\u8bc8\u6d3b\u52a8"
          }
        </li>
        <li>
          {
            "\u8bd5\u56fe\u672a\u7ecf\u6388\u6743\u8bbf\u95ee\u670d\u52a1\u7684\u4efb\u4f55\u90e8\u5206"
          }
        </li>
        <li>
          {
            "\u5e72\u6270\u6216\u7834\u574f\u670d\u52a1\u7684\u5b8c\u6574\u6027\u6216\u6027\u80fd"
          }
        </li>
        <li>
          {
            "\u5bf9\u670d\u52a1\u7684\u4efb\u4f55\u90e8\u5206\u8fdb\u884c\u53cd\u5411\u5de5\u7a0b\u3001\u53cd\u7f16\u8bd1\u6216\u53cd\u6c47\u7f16"
          }
        </li>
        <li>
          {
            "\u4e0a\u4f20\u4fb5\u72af\u7b2c\u4e09\u65b9\u77e5\u8bc6\u4ea7\u6743\u7684\u5185\u5bb9"
          }
        </li>
      </ul>

      <h2>5. {"\u77e5\u8bc6\u4ea7\u6743"}</h2>
      <p>
        {
          "\u670d\u52a1\u53ca\u5176\u539f\u521b\u5185\u5bb9\u3001\u529f\u80fd\u548c\u6280\u672f\u5747\u4e3a"
        }
        {COMPANY_ZH}
        {
          "\u6240\u6709\uff0c\u53d7\u7248\u6743\u3001\u5546\u6807\u53ca\u5176\u4ed6\u77e5\u8bc6\u4ea7\u6743\u6cd5\u4fdd\u62a4\u3002\u7528\u6237\u751f\u6210\u7684\u5185\u5bb9\u4ecd\u5f52\u5176\u521b\u4f5c\u8005\u6240\u6709\uff0c\u4f46\u60a8\u6388\u4e88\u6211\u4eec\u5728\u670d\u52a1\u8303\u56f4\u5185\u4f7f\u7528\u8be5\u5185\u5bb9\u7684\u8bb8\u53ef\u3002"
        }
      </p>

      <h2>6. {"\u8d39\u7528\u4e0e\u652f\u4ed8"}</h2>
      <p>
        {
          "\u670d\u52a1\u7684\u67d0\u4e9b\u529f\u80fd\u53ef\u80fd\u9700\u8981\u4ed8\u8d39\u3002\u5728\u4ea7\u751f\u4efb\u4f55\u8d39\u7528\u4e4b\u524d\uff0c\u5b9a\u4ef7\u548c\u652f\u4ed8\u6761\u6b3e\u5c06\u88ab\u660e\u786e\u544a\u77e5\u3002\u9664\u975e\u53e6\u6709\u8bf4\u660e\uff0c\u6240\u6709\u8d39\u7528\u5747\u4e0d\u53ef\u9000\u6b3e\u3002"
        }
      </p>

      <h2>7. {"\u514d\u8d23\u58f0\u660e"}</h2>
      <p>
        {
          "\u670d\u52a1\u6309\u201c\u539f\u6837\u201d\u548c\u201c\u53ef\u7528\u201d\u57fa\u7840\u63d0\u4f9b\uff0c\u4e0d\u63d0\u4f9b\u4efb\u4f55\u660e\u793a\u6216\u6697\u793a\u7684\u4fdd\u8bc1\uff0c\u5305\u62ec\u4f46\u4e0d\u9650\u4e8e\u5bf9\u9002\u9500\u6027\u3001\u7279\u5b9a\u7528\u9014\u7684\u9002\u7528\u6027\u548c\u4e0d\u4fb5\u6743\u7684\u6697\u793a\u4fdd\u8bc1\u3002"
        }
      </p>

      <h2>8. {"\u8d23\u4efb\u9650\u5236"}</h2>
      <p>
        {
          "\u5728\u6cd5\u5f8b\u5141\u8bb8\u7684\u6700\u5927\u8303\u56f4\u5185\uff0c\u516c\u53f8\u4e0d\u5bf9\u56e0\u60a8\u4f7f\u7528\u670d\u52a1\u800c\u4ea7\u751f\u7684\u4efb\u4f55\u95f4\u63a5\u3001\u9644\u5e26\u3001\u7279\u6b8a\u3001\u540e\u679c\u6027\u6216\u60e9\u7f5a\u6027\u635f\u5bb3\u627f\u62c5\u8d23\u4efb\u3002"
        }
      </p>

      <h2>9. {"\u7ec8\u6b62"}</h2>
      <p>
        {
          "\u6211\u4eec\u53ef\u80fd\u4f1a\u81ea\u884c\u51b3\u5b9a\u7ec8\u6b62\u6216\u6682\u505c\u60a8\u7684\u8d26\u6237\u548c\u670d\u52a1\u8bbf\u95ee\u6743\u9650\uff0c\u6050\u4e0d\u53e6\u884c\u901a\u77e5\uff0c\u5982\u679c\u6211\u4eec\u8ba4\u4e3a\u60a8\u7684\u884c\u4e3a\u8fdd\u53cd\u4e86\u672c\u534f\u8bae\u6216\u5bf9\u5176\u4ed6\u7528\u6237\u3001\u6211\u4eec\u6216\u7b2c\u4e09\u65b9\u9020\u6210\u4e86\u635f\u5bb3\u3002"
        }
      </p>

      <h2>10. {"\u5730\u57df\u9650\u5236"}</h2>
      <p>
        {
          "xyzen.ai \u53ca\u5176\u76f8\u5173\u670d\u52a1\u4e0d\u9762\u5411\u4e2d\u534e\u4eba\u6c11\u5171\u548c\u56fd\uff08\u4e2d\u56fd\u5927\u9646\uff09\u5c45\u6c11\u63d0\u4f9b\u3002\u8bbf\u95ee\u6216\u4f7f\u7528\u672c\u670d\u52a1\u5373\u8868\u793a\u60a8\u58f0\u660e\u5e76\u4fdd\u8bc1\uff0c\u60a8\u4e0d\u4f4d\u4e8e\u4e2d\u56fd\u5927\u9646\u5883\u5185\uff0c\u4e5f\u4e0d\u53d7\u5176\u7ba1\u8f96\uff0c\u4e14\u975e\u4efb\u4f55\u53d7\u9650\u5730\u533a\u7684\u56fd\u6c11\u6216\u5c45\u6c11\u3002\u6211\u4eec\u4fdd\u7559\u81ea\u884c\u51b3\u5b9a\u9650\u5236\u4efb\u4f55\u53f8\u6cd5\u7ba1\u8f96\u533a\u8bbf\u95ee\u7684\u6743\u5229\u3002"
        }
      </p>

      <h2>11. {"\u9002\u7528\u6cd5\u5f8b"}</h2>
      <p>
        {
          "\u672c\u534f\u8bae\u53d7\u4e2d\u56fd\u9999\u6e2f\u7279\u522b\u884c\u653f\u533a\u6cd5\u5f8b\u7ba1\u8f96\u5e76\u636e\u5176\u89e3\u91ca\u3002\u56e0\u672c\u534f\u8bae\u5f15\u8d77\u7684\u4efb\u4f55\u4e89\u8bae\u5e94\u63d0\u4ea4\u81f3\u9999\u6e2f\u6cd5\u9662\u7ba1\u8f96\u3002"
        }
      </p>

      <h2>12. {"\u534f\u8bae\u53d8\u66f4"}</h2>
      <p>
        {
          "\u6211\u4eec\u4fdd\u7559\u968f\u65f6\u4fee\u6539\u672c\u534f\u8bae\u7684\u6743\u5229\u3002\u5728\u534f\u8bae\u53d8\u66f4\u540e\u7ee7\u7eed\u4f7f\u7528\u670d\u52a1\u5373\u8868\u793a\u60a8\u63a5\u53d7\u66f4\u65b0\u540e\u7684\u534f\u8bae\u3002"
        }
      </p>

      <h2>13. {"\u8054\u7cfb\u6211\u4eec"}</h2>
      <p>
        {
          "\u5982\u60a8\u5bf9\u672c\u534f\u8bae\u6709\u4efb\u4f55\u7591\u95ee\uff0c\u8bf7\u901a\u8fc7 "
        }
        <a href="mailto:support@xyzen.ai">support@xyzen.ai</a>
        {" \u8054\u7cfb\u6211\u4eec\u3002"}
      </p>
    </>
  );
}

export function TermsPage() {
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
          {isZh ? <ZhTerms /> : <EnTerms />}
        </article>
      </div>
    </div>
  );
}
