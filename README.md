## Taylor's Localization Project

![Web based localization visualization](https://github.com/taylorchasewhite/localization/blob/master/LocalizationScreenshot.png?raw=true")
Robotic localization enables a robot to understand where it is positioned in relation to the world.

##Background

This project is intended to visualize a particle filter used in the process of localization described in the latter half of my corresponding research document, The Road to the Future: A Look at Autonomous Vehicles and the Localization Problem. The localization problem is representative of finding one’s self in space. This visualization project shows the robot, Tupac, in space, and the particles represent potential locations Tupac could reside. The more concentrated the particles the more likely that Tupac is in that position. In the real world there is no one overlooking Tupac that can determine his exact location, so this program provides an example on how robots like Tupac determine their location. The code is in working form and the controls can be seen below. Each particle measures how far it is from each POI. These measurements are then compared to Tupac’s measurements to determine a score and likelihood for that particle for being chosen for the next population.

##Controls

↑ – Increase sensing noise
↓ – Decrease sensing noise
→ – Increase movement noise
← – Decrease movement noise
W – Increase ray count
S – Decrease ray count
V – Vector mode (experimental)
Click – Toggle POI placement

##Usage
– Solution score is the upper right hand corner
– Left hand side is reserved for measurements


### Additional links
 - [Check out the project on TaylorChaseWhite.com](http://www.taylorchasewhite.com/robotic-localization-visualization/)
 - [![Watch the video](https://github.com/taylorchasewhite/localization/blob/master/LocalizationVisPreview.png?raw=true)](https://www.youtube.com/watch?v=5w84924gKxQ)
