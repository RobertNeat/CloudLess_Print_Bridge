FILE: 1_fetch_printer_status.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Fetch full status of the printer
{
"pushing": {
"sequence_id": "0",
"command": "pushall",
"version": 1,
"push_target": 1
}
}

FILE: 2_pause-resume_print_job.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Pause the current print job
{
"print": {
"sequence_id": "0",
"command": "pause",
"param": ""
}
}
// [TESTED]: true
// [DESCRIPTION]: Resume the current print job
{
"print": {
"sequence_id": "0",
"command": "resume",
"param": ""
}
}

FILE: 3_cancel_current_print_job.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Cancel the current print job
{
"print": {
"sequence_id": "0",
"command": "stop",
"param": ""
}
}

FILE: 4_change_print_speed.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Change sprint speed for current print job
{
"print": {
"sequence_id": "0",
"command": "print_speed",
"param": "2" // Print speed level as a string
// 1 = silent (50% speed)
// 2 = standard (100% speed)
// 3 = sport (124% speed)
// 4 = ludicrous (166% speed)
}
}

FILE: 1_set_buildplate_temp.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Set build plate temperature to 50°C
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "M140 S50\n"
}
}

FILE: 2_set_hotend_temp.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Set hotend temperature to 50°C
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "M104 S50\n"
}
}

FILE: 1_set_fan_speed.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Set fan speed to 50% (0-255) ... in bambu studio is by 10% from 0 to 100%
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "M106 P1 S128\n"
}
}

FILE: 2_turn_on_off_lights.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Turn on/off the light
{
"system": {
"sequence_id": "0",
"command": "ledctrl",
"led_node": "chamber_light",
"led_mode": "on" // off
}
}

FILE: 1_home_all_axes.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Home all axes
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G28\n"
}
}

FILE: 2_move_in_absolute_coordinates.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Home, set absolute coordinates and move to X:125mm, Y:125mm, Z:20mm
// [STEPS]:
// G28 - Home all axes
// G90 - Set absolute coordinates
// G1 - linear move to position
// X125 - Move to X=125mm
// Y125 - Move to Y=125mm
// Z20 - Move to Z=20mm
// F3000 - Set feedrate to 3000 mm/min (50 mm/s aka. standard speed for moving)
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G28\n G90\n G1 X125 Y125 Z20 F3000\n"
}
}

FILE: 3_move_X_absolute_mode.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Move to X=0 and X=256 in absolute mode (G90) with safe limits
// Move to X=0 (tested and is safe with wiggle room)
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G90\n G1 X0 F3000\n"
}
}
//Move to X=256 (tested and is safe with wiggle room)
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G90\n G1 X256 F3000\n"
}
}

FILE: 4_move_Y_absolute_mode.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Move to Y=0 and Y=256 in absolute mode (G90) with safe limits
// Move to Y=0 (tested and is safe with wiggle room)
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G90\n G1 Y0 F3000\n"
}
}
//Move to Y=256 (tested and is safe with wiggle room)
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G90\n G1 Y256 F3000\n"
}
}

FILE: 5_move_Z_absolute_mode.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Move to Z=20 and Z=240 in absolute mode (G90) with safe limits
// Move to Z=20 (tested and is safe with wiggle room)
// WARNING: Do no move to Z less than 20mm to ensure wiggle room to avoid scratching plate
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G90\n G1 Z20 F3000\n"
}
}
//Move to Z=240 (tested and is safe with wiggle room)
// WARNING: Do no move to Z more than 240mm to ensure wiggle room to avoid breaking lead screws
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "G90\n G1 Z240 F3000\n"
}
}

FILE: 6_extrude_relative_mode.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Extrude 50mm of filament in relative mode
// [STEPS]:
// M83 - Set extruder to relative mode
// E50 - push 50mm of filament through the nozzle
// F600 - Set feedrate to 600 mm/min (10 mm/s aka. standard speed for extrusion)
// M82 - Set extruder to absolute mode
// WARNING: this command must be performed with heated nozzle so the pushed filement can flow
//push 50mm of filament through the nozzle
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "M83\n G1 E50 F600\n M82\n"
}
}
// pull 50mm of filament back
{
"print": {
"sequence_id": "0",
"command": "gcode_line",
"param": "M83\n G1 E-50 F600\n M82\n"
}
}

FILE: 1_load_the_filament.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Load filament from AMS
//
// Spool numbering:
// slot 1 - slot_id: 0
// slot 2 - slot_id: 1
// slot 3 - slot_id: 2
// slot 4 - slot_id: 3
{
"print": {
"sequence_id": "1002",
"command": "ams_change_filament",
"ams_id": 0,
"slot_id": 2,
"target": 2,
"curr_temp": -1,
"tar_temp": 240 //filament temperature in Celsius according to filament type
}
}
//------------------------------------------------------
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Load filament from external spool
//
// External spool numbering:
// slot_id: 254
//
// Unknown/ nothing selected:
// slot_id: 255
{
"print": {
"sequence_id": "1002",
"command": "ams_change_filament",
"target": 254,
"slot_id": 254,
"curr_temp": -1,
"tar_temp": 240 //filament temperature in Celsius according to filament type
}
}

FILE: 2_unload_the_filament.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Unload filament from AMS or external spool
// The loaded slot does not matter (printer remembers slot and if it is in AMS or is external).
{
"print": {
"sequence_id": "1003",
"command": "unload_filament"
}
}

FILE: 3_set_filament_information.jsonc
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Define AMS spool filament type
//
// Spool numbering:
// slot 1 - target_ID: 0
// slot 2 - target_ID: 1
// slot 3 - target_ID: 2
// slot 4 - target_ID: 3
//
{
"print": {
"sequence_id": "1102",
"command": "ams_filament_setting",
"ams_id": 0,
"tray_id": 3,
"tray_info_idx": "GFL99",
"tray_color": "FFFF00FF", //RRGGBB-FF
"nozzle_temp_min": 190,
"nozzle_temp_max": 240,
"tray_type": "PLA"
}
}
//-----------------------------------------------------
// [TYPE]: command
// [TOPIC]: device/03919D581204433/request
// [TESTED]: true
// [DESCRIPTION]: Define external spool filament type
//
// External spool numbering:
// tray_id: 254
//
// Unknown/ nothing selected:
// tray_id: 255
//
{
"print": {
"sequence_id": "1201",
"command": "ams_filament_setting",
"ams_id": 255,
"tray_id": 254,
"tray_info_idx": "GFL99",
"tray_color": "00FFFFFF", //cyan RRGGBB-FF
"nozzle_temp_min": 190,
"nozzle_temp_max": 240,
"tray_type": "PLA"
}
}

FILE: filament definitions.md
{
tray_info_idx
ams_id
tray_id
tray_color
tray_type
nozzle_temp_min
nozzle_temp_max
}

# Mapowania identyfikatorów 'tray_info_idx' na typ filamentu + marka

mapowania identyfikatorów w oprogramowaniu (mapowania z identyfikatorów na typ + marka)

| tray_info_idx | filament type | filament brand |
| ------------- | ------------- | -------------- |
| GFA00         | PLA           | Bambulab       |
| GFA50         | PLA-CF        | Bambulab       |
| GFB00         | ABS           | Bambulab       |
| GFG00         | PETG          | Bambulab       |
| GFU01         | TPU           | Bambulab       |
| -             | -             | -              |
| GFL99         | PLA           | Generic        |
| GFB99         | ABS           | Generic        |
| GFG99         | PETG          | Generic        |
| GFU99         | TPU           | Generic        |
| -             | -             | -              |

# Mapowania identyfikatorów 'ams_id + tray_id' na slot AMS

ams_id + tray_id <-- zrobić mapowanie z UI do ams + slot

```
ams_id:
- AMS unit index,
- for one AMS Lite - use 0,
- external spool - use 255,

tray_id:
- local slot index 0–3,
- external 254,
```

| slot     | ams_id | tray_id |
| -------- | ------ | ------- |
| 1        | 0      | 0       |
| 2        | 0      | 1       |
| 3        | 0      | 2       |
| 4        | 0      | 3       |
| -        | -      | -       |
| external | 255    | 254     |

# Definicje filamentów i temperatur (z BambuStudio)

```
tray_color  <-- color picker
tray_type <-- select box: PLA, ABS, PETG ...
nozzle_temp_min <-- wpisywalna wartość numeryczna
nozzle_temp_max <-- wpisywalna wartość numeryczna
```

// Filamenty Bambu Lab:

```
{
"tray_color": "64C8FFFF",
"tray_type": "PLA",
"nozzle_temp_min": 190,
"nozzle_temp_max": 240
},
{
"tray_color": "64C8FFFF",
"tray_type": "PLA-CF",
"nozzle_temp_min": 210,
"nozzle_temp_max": 250
},
{
"tray_color": "64C8FFFF",
"tray_type": "ABS",
"nozzle_temp_min": 240,
"nozzle_temp_max": 280
},
{
"tray_color": "64C8FFFF",
"tray_type": "PETG",
"nozzle_temp_min": 230,
"nozzle_temp_max": 270
},
{
"tray_color": "64C8FFFF",
"tray_type": "TPU",
"nozzle_temp_min": 200,
"nozzle_temp_max": 250
}
```

//Filamenty Generic:

```
{
  "tray_color": "64C8FFFF",
  "tray_type": "PLA",
  "nozzle_temp_min": 190,
  "nozzle_temp_max": 240
},
{
  "tray_color": "64C8FFFF",
  "tray_type": "ABS",
  "nozzle_temp_min": 240,
  "nozzle_temp_max": 280
},
{
  "tray_color": "64C8FFFF",
  "tray_type": "PETG",
  "nozzle_temp_min": 220,
  "nozzle_temp_max": 270
},
{
  "tray_color": "64C8FFFF",
  "tray_type": "TPU",
  "nozzle_temp_min": 200,
  "nozzle_temp_max": 250
}
```
