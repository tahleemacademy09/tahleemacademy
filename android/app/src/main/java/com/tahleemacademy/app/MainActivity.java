package com.tahleemacademy.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (in-app) Capacitor plugins must be registered before super.onCreate()
        registerPlugin(ScreenSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
