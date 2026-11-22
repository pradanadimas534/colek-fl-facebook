package com.colekbalik.facebook;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String FB_POKES_URL = "https://m.facebook.com/pokes";
    private static final String LOCAL_SIM_URL = "file:///android_asset/mobile-apk-preview.html";

    private WebView webView;
    private TextView statusBadgeView;
    private TextView urlSubView;
    private Button switchModeBtn;
    private boolean isShowingSimulator = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0F172A"));

        // Native Android Top Control Bar (Utilitarian-Clean, >=44dp touch targets)
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(Color.parseColor("#1E293B"));
        int padH = dp(12);
        int padV = dp(8);
        topBar.setPadding(padH, padV, padH, padV);

        LinearLayout titleCol = new LinearLayout(this);
        titleCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f
        );
        titleCol.setLayoutParams(titleParams);

        LinearLayout badgeRow = new LinearLayout(this);
        badgeRow.setOrientation(LinearLayout.HORIZONTAL);
        badgeRow.setGravity(Gravity.CENTER_VERTICAL);

        statusBadgeView = new TextView(this);
        statusBadgeView.setText("[MENUNGGU LOGIN]");
        statusBadgeView.setTextColor(Color.parseColor("#F8FAFC"));
        statusBadgeView.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        statusBadgeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        statusBadgeView.setPadding(dp(6), dp(2), dp(6), dp(2));
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#0F172A"));
        badgeBg.setCornerRadius(dp(4));
        badgeBg.setStroke(dp(1), Color.parseColor("#94A3B8"));
        statusBadgeView.setBackground(badgeBg);

        TextView appTitle = new TextView(this);
        appTitle.setText("  Colek Balik 1-Klik");
        appTitle.setTextColor(Color.parseColor("#F8FAFC"));
        appTitle.setTypeface(Typeface.DEFAULT_BOLD);
        appTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);

        badgeRow.addView(statusBadgeView);
        badgeRow.addView(appTitle);

        urlSubView = new TextView(this);
        urlSubView.setText("Login Facebook -> Otomatis Deteksi & Balas Colekan");
        urlSubView.setTextColor(Color.parseColor("#CBD5E1"));
        urlSubView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);

        titleCol.addView(badgeRow);
        titleCol.addView(urlSubView);

        Button pokesBtn = createTopButton("Halaman Colekan", "#0F56B3", "#FFFFFF");
        pokesBtn.setOnClickListener(v -> {
            isShowingSimulator = false;
            switchModeBtn.setText("Simulator");
            webView.loadUrl(FB_POKES_URL);
        });

        switchModeBtn = createTopButton("Simulator", "#334155", "#F8FAFC");
        LinearLayout.LayoutParams simParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)
        );
        simParams.setMarginStart(dp(6));
        switchModeBtn.setLayoutParams(simParams);
        switchModeBtn.setOnClickListener(v -> {
            if (isShowingSimulator) {
                isShowingSimulator = false;
                switchModeBtn.setText("Simulator");
                webView.loadUrl(FB_POKES_URL);
            } else {
                isShowingSimulator = true;
                switchModeBtn.setText("FB Asli");
                webView.loadUrl(LOCAL_SIM_URL);
            }
        });

        topBar.addView(titleCol);
        topBar.addView(pokesBtn);
        topBar.addView(switchModeBtn);

        View divider = new View(this);
        divider.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(2)
        ));
        divider.setBackgroundColor(Color.parseColor("#60A5FA"));

        webView = new WebView(this);
        webView.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f
        ));

        configureWebView();

        root.addView(topBar);
        root.addView(divider);
        root.addView(webView);

        setContentView(root);

        // Start directly on Facebook Pokes (if not logged in, Facebook shows its official login screen, then redirects to /pokes)
        webView.loadUrl(FB_POKES_URL);
    }

    private Button createTopButton(String text, String bgHex, String fgHex) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setAllCaps(false);
        btn.setTextColor(Color.parseColor(fgHex));
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        btn.setMinHeight(dp(44));
        btn.setMinimumHeight(dp(44));
        btn.setPadding(dp(10), dp(6), dp(10), dp(6));

        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.parseColor(bgHex));
        drawable.setCornerRadius(dp(6));
        drawable.setStroke(dp(1), Color.parseColor("#94A3B8"));
        btn.setBackground(drawable);
        return btn;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
        );

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                CookieManager.getInstance().flush();
                updateAuthStatusBar(url);
                injectAutoPokeEngine(view, url);
            }
        });
    }

    private void updateAuthStatusBar(String url) {
        String cookies = CookieManager.getInstance().getCookie("https://m.facebook.com");
        boolean hasFbUserCookie = cookies != null && cookies.contains("c_user=");

        if (url != null && url.startsWith("file://")) {
            statusBadgeView.setText("[MODE SIMULATOR]");
            urlSubView.setText("Simulator Login & Auto-Deteksi Colekan");
            return;
        }

        if (hasFbUserCookie) {
            statusBadgeView.setText("[AKUN TERHUBUNG]");
            if (url != null && !url.contains("/pokes")) {
                urlSubView.setText("Login berhasil! Ketuk 'Halaman Colekan' untuk mulai auto-colek.");
            } else {
                urlSubView.setText("Memantau halaman Colekan (/pokes) secara otomatis...");
            }
        } else {
            statusBadgeView.setText("[SILAKAN LOGIN]");
            urlSubView.setText("Masuk ke akun Facebook Anda untuk mengaktifkan auto-colek");
        }
    }

    private void injectAutoPokeEngine(WebView view, String url) {
        if (url == null) return;
        // Local simulator already loads content.css and content.js directly.
        if (url.startsWith("file://")) return;

        // Only inject the floating auto-poke panel once the user is on /pokes or logged in.
        String cssContent = readAssetText("content.css");
        String jsContent = readAssetText("content.js");
        if (cssContent.isEmpty() || jsContent.isEmpty()) return;

        String escapedCss = cssContent
                .replace("\\", "\\\\")
                .replace("`", "\\`")
                .replace("$", "\\$");

        String injectorScript = "(function() {" +
                "if (!document.getElementById('cbf-injected-style')) {" +
                "  var st = document.createElement('style');" +
                "  st.id = 'cbf-injected-style';" +
                "  st.textContent = `" + escapedCss + "`;" +
                "  document.head.appendChild(st);" +
                "}" +
                "})(); " + jsContent;

        view.evaluateJavascript(injectorScript, null);
    }

    private String readAssetText(String fileName) {
        StringBuilder sb = new StringBuilder();
        try (InputStream is = getAssets().open(fileName);
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        } catch (IOException e) {
            return "";
        }
        return sb.toString();
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
        );
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void openFacebookPokes() {
            runOnUiThread(() -> {
                isShowingSimulator = false;
                switchModeBtn.setText("Simulator");
                webView.loadUrl(FB_POKES_URL);
            });
        }
    }
}
