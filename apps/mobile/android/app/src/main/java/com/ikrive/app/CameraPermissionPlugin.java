package com.ikrive.app;

import android.Manifest;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Exposes the state of the CAMERA permission to the web (`checkPermissions()`, inherited from Plugin) so it
 * can tell a denied permission from a cancelled camera. It asks for nothing: Capacitor's file chooser asks for
 * the permission itself when an input with `capture` opens the camera.
 */
@CapacitorPlugin(name = "CameraPermission", permissions = @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }))
public class CameraPermissionPlugin extends Plugin {}
