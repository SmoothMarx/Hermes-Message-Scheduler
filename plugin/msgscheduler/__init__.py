"""Message Scheduler plugin library.

A uniquely-named package on purpose: the plugin is imported three different ways
(Hermes' native plugin loader, the dashboard loader importing ``dashboard/plugin_api.py``
by file path, and the cron script run as a script), and each entry file puts the plugin
directory on ``sys.path`` before importing this package. A generic name like ``core`` or
``config`` would collide with another plugin doing the same thing.
"""
