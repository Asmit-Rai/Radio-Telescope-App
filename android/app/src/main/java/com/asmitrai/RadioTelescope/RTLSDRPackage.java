package com.asmitrai.RadioTelescope;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

// React Native package for integrating RTL-SDR functionality
public class RTLSDRPackage implements ReactPackage {
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext ctx) {
        return Collections.emptyList();
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext ctx) {
        List<NativeModule> mods = new ArrayList<>();
        mods.add(new RTLSDRModule(ctx));
        return mods;
    }
}