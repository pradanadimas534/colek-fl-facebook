package com.colekbalik.facebook;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
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
    private TextView subtitleView;
    private TextView logLineView;
    private Button modeBtn;
    private Button pokesNavBtn;
    private Button pokeNowBtn;
    private Button autoWatchBtn;
    private Button autoRefreshBtn;
    private Button speedBtn;

    private boolean isShowingSimulator = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusBadgeView = findViewById(R.id.apk_status_badge);
        subtitleView = findViewById(R.id.apk_subtitle_text);
        logLineView = findViewById(R.id.apk_log_line);
        modeBtn = findViewById(R.id.apk_mode_btn);
        pokesNavBtn = findViewById(R.id.apk_pokes_nav_btn);
        pokeNowBtn = findViewById(R.id.apk_poke_now_btn);
        autoWatchBtn = findViewById(R.id.apk_autowatch_btn);
        autoRefreshBtn = findViewById(R.id.apk_autorefresh_btn);
        speedBtn = findViewById(R.id.apk_speed_btn);
        webView = findViewById(R.id.apk_webview);

        styleRoundedView(statusBadgeView, "#064E3B", "#34D399", 4);
        styleRoundedView(modeBtn, "#334155", "#94A3B8", 6);
        styleRoundedView(pokesNavBtn, "#0F56B3", "#60A5FA", 6);
        styleRoundedView(pokeNowBtn, "#0F56B3", "#60A5FA", 6);
        styleRoundedView(autoWatchBtn, "#064E3B", "#34D399", 6);
        styleRoundedView(autoRefreshBtn, "#064E3B", "#34D399", 6);
        styleRoundedView(speedBtn, "#334155", "#94A3B8", 6);

        pokesNavBtn.setOnClickListener(v -> {
            if (isShowingSimulator) {
                webView.evaluateJavascript(
                        "if (window.CBFController) { window.CBFController.triggerAutoRefreshNow(); }",
                        null
                );
            } else {
                webView.loadUrl(FB_POKES_URL);
            }
        });

        modeBtn.setOnClickListener(v -> {
            if (isShowingSimulator) {
                isShowingSimulator = false;
                modeBtn.setText("Simulator");
                webView.loadUrl(FB_POKES_URL);
            } else {
                isShowingSimulator = true;
                modeBtn.setText("FB Asli");
                webView.loadUrl(LOCAL_SIM_URL);
            }
        });

        pokeNowBtn.setOnClickListener(v -> {
            if (webView != null) {
                webView.evaluateJavascript(
                        "if (window.CBFController) { window.CBFController.pokeAll(); }",
                        null
                );
            }
        });

        autoWatchBtn.setOnClickListener(v -> {
            if (webView != null) {
                webView.evaluateJavascript(
                        "if (window.CBFController) { var st = window.CBFController.getState(); window.CBFController.setAutoWatch(!st.autoWatch); }",
                        null
                );
            }
        });

        autoRefreshBtn.setOnClickListener(v -> {
            if (webView != null) {
                webView.evaluateJavascript(
                        "if (window.CBFController) { window.CBFController.cycleAutoRefresh(); }",
                        null
                );
            }
        });

        speedBtn.setOnClickListener(v -> {
            if (webView != null) {
                webView.evaluateJavascript(
                        "if (window.CBFController) { var m = window.CBFController.getState().delayMode; var next = (m === 'stealth') ? 'safe' : (m === 'safe' ? 'fast' : (m === 'fast' ? 'instant' : 'stealth')); window.CBFController.setDelayMode(next); }",
                        null
                );
            }
        });

        configureWebView();
        webView.loadUrl(FB_POKES_URL);
    }

    private void styleRoundedView(View view, String bgHex, String strokeHex, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.parseColor(bgHex));
        d.setCornerRadius(dp(radiusDp));
        d.setStroke(dp(1), Color.parseColor(strokeHex));
        view.setBackground(d);
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
                injectAutoPokeEngine(view, url);
            }
        });
    }

    private void injectAutoPokeEngine(WebView view, String url) {
        if (url == null) return;
        view.evaluateJavascript("window.__CBF_NATIVE_ANDROID_DOCK__ = true;", null);

        if (url.startsWith("file://")) {
            view.evaluateJavascript("if (window.CBFController) { window.CBFController.notifyNativeDock(); }", null);
            return;
        }

        String cssContent = readAssetText("content.css");
        String jsContent = readAssetText("content.js");
        if (cssContent.isEmpty() || jsContent.isEmpty()) return;

        String escapedCss = cssContent
                .replace("\\", "\\\\")
                .replace("`", "\\`")
                .replace("$", "\\$");

        String injectorScript = "(function() {" +
                "window.__CBF_NATIVE_ANDROID_DOCK__ = true;" +
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
                modeBtn.setText("Simulator");
                webView.loadUrl(FB_POKES_URL);
            });
        }

        @JavascriptInterface
        public void reloadPokesPage() {
            runOnUiThread(() -> {
                if (webView == null) return;
                String currentUrl = webView.getUrl();
                if (currentUrl != null && currentUrl.contains("/pokes")) {
                    webView.reload();
                } else if (!isShowingSimulator) {
                    webView.loadUrl(FB_POKES_URL);
                } else {
                    webView.reload();
                }
            });
        }

        @JavascriptInterface
        public void onStateUpdated(
                final String badgeText,
                final int detectedCount,
                final int pokedCount,
                final boolean autoWatch,
                final boolean isProcessing,
                final String delayMode,
                final String latestLog,
                final int autoRefreshSec,
                final int refreshCountdownSec
        ) {
            runOnUiThread(() -> {
                statusBadgeView.setText(badgeText);
                subtitleView.setText("Siap: " + detectedCount + " | Terbalas: " + pokedCount);

                if (isProcessing) {
                    pokeNowBtn.setText("Stop (" + pokedCount + ")");
                    styleRoundedView(pokeNowBtn, "#991B1B", "#F87171", 6);
                } else {
                    pokeNowBtn.setText("Balas (" + detectedCount + ")");
                    styleRoundedView(pokeNowBtn, "#0F56B3", "#60A5FA", 6);
                }

                if (autoWatch) {
                    autoWatchBtn.setText("Auto: ON");
                    autoWatchBtn.setTextColor(Color.parseColor("#A7F3D0"));
                    styleRoundedView(autoWatchBtn, "#064E3B", "#34D399", 6);
                } else {
                    autoWatchBtn.setText("Auto: OFF");
                    autoWatchBtn.setTextColor(Color.parseColor("#CBD5E1"));
                    styleRoundedView(autoWatchBtn, "#334155", "#94A3B8", 6);
                }

                if (autoRefreshSec > 0) {
                    autoRefreshBtn.setText("Ref: " + refreshCountdownSec + "d/" + autoRefreshSec + "d");
                    autoRefreshBtn.setTextColor(Color.parseColor("#A7F3D0"));
                    styleRoundedView(autoRefreshBtn, "#064E3B", "#34D399", 6);
                } else {
                    autoRefreshBtn.setText("Ref: MATI");
                    autoRefreshBtn.setTextColor(Color.parseColor("#CBD5E1"));
                    styleRoundedView(autoRefreshBtn, "#334155", "#94A3B8", 6);
                }

                if ("fast".equals(delayMode)) {
                    speedBtn.setText("Cepat");
                } else if ("instant".equals(delayMode)) {
                    speedBtn.setText("Instan");
                } else if ("safe".equals(delayMode)) {
                    speedBtn.setText("Aman");
                } else {
                    speedBtn.setText("Anti-Limit");
                }

                if (latestLog != null && !latestLog.isEmpty()) {
                    logLineView.setText(latestLog);
                }
            });
        }

        @JavascriptInterface
        public void performTrustedTap(final int pixelX, final int pixelY) {
            runOnUiThread(() -> {
                if (webView == null) return;
                long downTime = SystemClock.uptimeMillis();
                long holdMs = 55L + (long) (Math.random() * 65L);
                MotionEvent downEvent = MotionEvent.obtain(
                        downTime,
                        downTime,
                        MotionEvent.ACTION_DOWN,
                        (float) pixelX,
                        (float) pixelY,
                        0
                );
                webView.dispatchTouchEvent(downEvent);
                downEvent.recycle();

                webView.postDelayed(() -> {
                    long upTime = SystemClock.uptimeMillis();
                    MotionEvent upEvent = MotionEvent.obtain(
                            downTime,
                            upTime,
                            MotionEvent.ACTION_UP,
                            (float) pixelX,
                            (float) pixelY,
                            0
                    );
                    webView.dispatchTouchEvent(upEvent);
                    upEvent.recycle();
                }, holdMs);
            });
        }
    }
}
