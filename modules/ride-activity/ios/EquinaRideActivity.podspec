# The app's own Expo module for the ride's Live Activity. Autolinked from
# modules/ (Expo's default folder for local modules); there is no npm package.
#
# Not named RideActivity: that is the widget extension's product, and two Swift
# modules of one name in the same build folder make the app import the
# extension's (iOS 16.2) in place of this one.
Pod::Spec.new do |s|
  s.name           = 'EquinaRideActivity'
  s.version        = '1.0.0'
  s.summary        = "Starts, updates and ends the ride's Live Activity."
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Equina'
  s.homepage       = 'https://equina.ai'
  # The app's own minimum. ActivityKit only exists from iOS 16.1, so it is
  # linked weakly and every call checks the version first: the app still
  # opens on iOS 15 and simply shows no Live Activity.
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ActivityKit'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
