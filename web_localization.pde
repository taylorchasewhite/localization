// Taylor White
// April 27, 2014
// Localization Visualization
// Miami University
// Algorithm Design under Dr. Bo Brinkman

// Global variables
float radius = 50.0;
int X, Y;
int nX, nY;
int delay = 16;

float pRadius = 20.0;
int npX, npY;
int changeRate =3;
int pDelay = 24;
int worldSize =1000;
int particleCount = 500;
int rayMaxLength = 200;
int maxRayCount = 30;
int poiRadius = 100;
int tooCloseDistance;
int globalRayCount;
int globalRayWidth;
color robotColor;
color particleColor;
int mutationRate;
color poiColor;
color black;
color topColor;
color rayColor;
color vectorColor;
int [][] pointsOfInterest;
ArrayList poiA;
int cols = 2;
int rows = 0;
String mySense;
float solutionScore;
ArrayList rayReadings;
Robot [] particles;
Robot tupac;
boolean turnLeft;
float globalForwardNoise;
float globalSenseNoise;
float globalTurnNoise;
boolean vectorMode;

// Setup the Processing Canvas
void setup(){
  rectMode(CENTER);
  //ellipseMode(CENTER_RADIUS);
  //worldSize = 950;
  topColor = color (2, 134, 227, 255);
  robotColor = color(0, 121, 184, 255);
  particleColor = color(255, 0, 121, 21);
  vectorMode = false;
  rayColor= color (127, 0, 255, 255);
  vectorColor= color (127, 0, 255, 120);
  particles = new Robot [particleCount];
  mutationRate = 400;
  globalForwardNoise = .5;
  globalTurnNoise = .5;
  globalSenseNoise = 5;
  globalRayCount = 15;
  tooCloseDistance = 200;
  rayReadings = new ArrayList();
  for (int i = 0; i < globalRayCount; i++) {
     rayReadings.add(rayMaxLength); 
  }
  globalRayWidth = 10;
  mySense = "";
  solutionScore = 0;
  pointsOfInterest = new int [rows][cols];
  poiA = new ArrayList();
  for (int i = 0; i < rows; i++) {
    poiA.add(new int[2]);
    for (int j = 0; j < cols; j++) {
      poiA.get(i)[j] =  int(random(worldSize)); 
    }
  } 
  size( 1000, 1000 );
  strokeWeight( 10 );
  frameRate( 15 );
  X = width / 2;
  Y = height / 2;
  nX = X;
  nY = Y;
  npX = X;
  npY = Y;  
  PFont font;
  //font = loadFont("Serif-20.vlw"); // Arial, 16 point, anti-aliasing
  font = createFont("GE Inspira", 20, true);
  textFont(font, 20);                 // STEP 4 Specify font to be used
  black = color(0);
  poiColor = color(0,184, 121, 255);
  for (int i = 0; i< particles.length; i++) {
    particles[i] = new Robot(true, "particle " + str(i)); 
    particles[i].setNoise(globalForwardNoise,globalTurnNoise,globalSenseNoise); 
  }
  tupac = new Robot(false, "Tupac");
  tupac.setNoise(globalForwardNoise,globalTurnNoise, globalSenseNoise); 
  //temp = new Robot(true, "particle" +i);


}
 
// Main draw loop
void draw(){  
  ////println(frameCount);
  background( 255 );  // Fill canvas white
  //drawRobot();
  drawPOIs();
  tupac.drawFRobot();
  for (int i = 0; i< particles.length; i++) {
    particles[i].drawFRobot(); 
  }
  
  if(frameCount%changeRate==0) {
    ////println(frameCount);
    frameStep();
  }
  // Track circle to new destination
  tupac.drawRays();
  textUpdate();
  /*if (poiA.size() > 0) {
     fill(color(255,255,0, 255));
     stroke(color(255,255,0, 255));
     line(tupac.xPosition, tupac.yPosition, poiA.get(0)[0], poiA.get(0)[1]);
  }*/
}
 void mousePressed() {
   //frameStep();
   for (int i =0; i < poiA.size(); i ++) {
     float distance = sqrt(sq(mouseX - poiA.get(i)[0])+ sq(mouseY - poiA.get(i)[1])); 

    if (distance < poiRadius) {
      poiA.remove(i);
      return;
    }
   }
   poiA.add(new int[2]);
   poiA.get(poiA.size()-1)[0] = int(mouseX);
   poiA.get(poiA.size()-1)[1] = int(mouseY);
}

void frameStep() {
  float turn = 0;
  float forward = 15;
  if (tupac.getMinDistance() < tooCloseDistance) {
    turn = turnLeft ? PI / 25 : -PI / 25;
    forward = 7.5;
  }
  // The robot and every hypothesis receive the same odometry command.
  tupac.move(turn, forward);
  for (int i = 0; i < particles.length; i++) {
    particles[i].move(turn, forward);
  }
  ArrayList measurements = tupac.sense();
  if (poiA.size() > 0 && measurements.size() > 0) {
    float[] weights = new float[particles.length];
    for (int i = 0; i < particles.length; i++) {
      weights[i] = particles[i].measurementLogProbability(measurements);
    }
    // Shift log likelihoods before exponentiation so unlikely observations
    // cannot underflow every weight to zero.
    float best = max(weights);
    for (int i = 0; i < weights.length; i++) {
      weights[i] = exp(weights[i] - best);
    }
    resampleParticles(weights);
  }
  evaluateSolution();
}

void resampleParticles(float[] weights) {
  // Never overwrite the population being sampled (including on later frames).
  Robot[] next = new Robot[particles.length];
  float total = 0;
  for (int i = 0; i < weights.length; i++) total += weights[i];
  float spacing = total / particles.length;
  float target = random(spacing);
  float cumulative = weights[0];
  int index = 0;
  for (int i = 0; i < particles.length; i++) {
    while (target > cumulative && index < particles.length - 1) {
      index++;
      cumulative += weights[index];
    }
    Robot parent = particles[index];
    Robot child = new Robot(true, "particle " + i);
    if (random(1) >= 1.0 / mutationRate) {
      child.setRobot(parent.xPosition, parent.yPosition, parent.orientation);
    }
    child.setNoise(globalForwardNoise, globalTurnNoise, globalSenseNoise);
    next[i] = child;
    target += spacing;
  }
  particles = next;
}
void mouseMoved(){ // Set circle's next destination
  nX = mouseX;
  nY = mouseY;
}

void keyPressed() {
 if (key == CODED) {
    if (keyCode == UP) {
      globalSenseNoise +=.25;
    } else if (keyCode == DOWN) {
      if( globalSenseNoise > 0) {
        globalSenseNoise -=.25;
      }
    } else if (keyCode == RIGHT) {
      globalForwardNoise +=.25;
      tupac.forwardNoise = globalForwardNoise;
      for(int i =0; i < particles.length; i ++) {
        particles[i].forwardNoise = globalForwardNoise; 
      }
    } else if (keyCode == LEFT) {
      if (globalForwardNoise > 0) {
        globalForwardNoise -=.25;
        tupac.forwardNoise = globalForwardNoise;
        for(int i =0; i < particles.length; i ++) {
          particles[i].forwardNoise = globalForwardNoise; 
        }
      }
    } else if (keyCode == SHIFT) {
      globalTurnNoise += .05 * PI;
      if(globalTurnNoise > TWO_PI) {
       globalTurnNoise = 0; 
      }
      for(int i =0; i < particles.length; i ++) {
        particles[i].turnNoise = globalTurnNoise; 
      }
      tupac.turnNoise = globalTurnNoise;
    } 
 }else {
   if(key==119) {
     if( globalRayCount < maxRayCount){
        globalRayCount++; 
        rayReadings.add(rayMaxLength);
     }
   }
   else if (key == 115) { 
     if( globalRayCount > 0){
        globalRayCount--; 
        rayReadings.remove(rayReadings.size() - 1);
     }     
   }
   else if (key == 97) { 
     if( globalRayWidth > 30){
        globalRayWidth-=35; 
     }
     else if( globalRayWidth > 1){
        globalRayWidth--; 
     }     
   }
   else if (key == 100) { 
     if(globalRayWidth < 30) {
        globalRayWidth+=1;        
     }
     else if( globalRayWidth <  180){
        globalRayWidth+= 5; 
     }     
   }
   else if (key == 118) { 
     vectorMode = !vectorMode;
   }
   for(int i =0; i < particles.length; i ++) {
     particles[i].rayCount = globalRayCount;
     particles[i].rayWidth = globalRayWidth;
   }
   tupac.rayCount = globalRayCount;
   tupac.rayWidth = globalRayWidth;
  
 }
 tupac.senseNoise = globalSenseNoise;
 for (int i = 0; i < particles.length; i++) {
   particles[i].senseNoise = globalSenseNoise;
 }

}

void textUpdate() {
  fill(topColor);                        // STEP 5 Specify font color 
  String x = "Robot Coordinates:\t[" + int(tupac.xPosition) + "," + int(tupac.yPosition)+"]";
  text("Say hello to Tupac the robot!",10,30);  // STEP 6 Display Text
  text(x,735,30);  // STEP 6 Display Text
  fill(black);                        // STEP 5 Specify font color 
  text(mySense, 10, 55);
  text("Mean error (px): " + nf(solutionScore,0,2), 735, 55);

  
  text("Move Noise:\t\t\t" + nf(globalForwardNoise,0,1), 735,75);
  text("Turn Noise:\t\t\t\t" + nf(globalTurnNoise,0,1), 735,95);
  text("Sense Noise:\t\t\t" + globalSenseNoise, 735,115);
  text("Ray Count:\t\t\t" + globalRayCount, 735,135);  
  //text("Ray Width:\t\t\t" + globalRayWidth, 735,155);
  if (!vectorMode) {  
    text("Radar Mode:\t\t\tOn", 735,155);  
  }else {  
    text("Radar Mode:\t\t\tOff", 735,155);
    mySense = "";
    for (int i = 0; i < rayReadings.size(); i ++) {
      String y = "Ray " + i + ":\t" + rayReadings.get(i)+ "";
       text(y, 10,int(i*20 + 50)); 
    }  
  }  

}

void drawRobot() {
  // Robot
  radius = radius + sin( frameCount / 4 );
  //robot
  strokeWeight( 10 );
  fill(robotColor);  // Set fill-color to blue
  stroke(black);   // Set stroke-color black
  ellipse( X, Y, radius, radius );  // Draw circle
  line(X, Y, (X+radius/4), (Y+radius/4));
  
  // Test Particle
  strokeWeight( 1);
  fill(particleColor);  // Set fill-color to blue
  stroke(black);    // Set stroke-color black
  ellipse( npX, npY, pRadius, pRadius ); 
  line(npX, npY, (npX+pRadius/4)+50/pRadius, (npY+pRadius/4)+50/pRadius);

}

void drawPOIs () {
  for (int i = 0; i < poiA.size(); i++) {
    strokeWeight( 3 );
    fill(poiColor);
    stroke(black);
//    rect(pointsOfInterest[i][0],pointsOfInterest[i][1], 45,45);
    rect(poiA.get(i)[0],poiA.get(i)[1], poiRadius,poiRadius);
    
  }
}

float evaluateSolution() {
  float sum = 0;
  for (int i = 0; i < particles.length; i++) {
    float dx = abs(particles[i].xPosition - tupac.xPosition);
    float dy = abs(particles[i].yPosition - tupac.yPosition);
    dx = min(dx, worldSize - dx);
    dy = min(dy, worldSize - dy);
    float error = sqrt(sq(dx) + sq(dy));
    sum+=error; 
  }
  float solution = float(sum/float(particles.length));
  //println("SOLUTION: "+solution);
  solutionScore = solution;
  return solution; 
}

float nextGaussian() {
   float v1, v2, s;
   do {
     v1 = 2 * random(0,1) - 1;   // between -1.0 and 1.0
     v2 = 2 * random(0,1) - 1;   // between -1.0 and 1.0
     s = v1 * v1 + v2 * v2;
   } while (s >= 1 || s == 0);
   float multiplier = sqrt(-2 * log(s)/s);
   //nextNextGaussian = v2 * multiplier;
   float temp = v1*multiplier;
   //if (temp <=0.0009) {
     //return nextGaussian();
   //}
   ////println(temp);
   return v1 * multiplier;
 }

//***************************************************************************//
//                               Robot Class                                 //
//***************************************************************************//
class Robot {
  float radius;
  String name; 
  int delay;
  color myColor;
  int strokeWidth;
  int pDelay = 24;
  float xPosition;
  float yPosition;
  float orientation; 
  float forwardNoise;
  float turnNoise; 
  float senseNoise; 
  int rayCount;
  int rayWidth;
  Robot(boolean particle, String name) {
     this.name = name;
     xPosition = random(worldSize);
     yPosition = random(worldSize);
     orientation = random(TWO_PI);
     forwardNoise = 0;
     turnNoise = 0;
     senseNoise = 0;
     rayCount = globalRayCount;
     rayWidth = globalRayWidth;
     if(particle) {
       myColor = particleColor;
       //delay = random(.65,1.2) * 24;
       delay = nextGaussian() + 24;
       strokeWidth = 1;
       radius = 35;
       ////println("robot created");
     } else {
       ////println("robot created");
       myColor = robotColor;
       delay = 5;
       strokeWidth = 10;
       radius = 50; 
     }
  } 
  
  void setRobot (float newX, float newY, float newOrientation) {
    xPosition = ((newX % worldSize) + worldSize) % worldSize;
    yPosition = ((newY % worldSize) + worldSize) % worldSize;
    orientation = ((newOrientation % TWO_PI) + TWO_PI) % TWO_PI;
  }
  
  void setNoise (float newForwardNoise, float newTurnNoise, float newSenseNoise) {
     forwardNoise = newForwardNoise;
     turnNoise = newTurnNoise;
     senseNoise = newSenseNoise;
  }
  
   ArrayList sense () {
     ArrayList measurements = new ArrayList();
     mySense = "";
     
     if(!vectorMode) {
       for (int i =0; i< poiA.size(); i ++) {
  
         float distance = sqrt(sq(xPosition - poiA.get(i)[0])+ sq(yPosition - poiA.get(i)[1])); 
         distance+=senseNoise*nextGaussian();
         measurements.add(distance);
         mySense += "POI " + str(i)+": " + nf(distance,0,2) + "\n";
       }
     }
     else {
       for (int i =0; i < rayCount; i++) {
         float measure = this.getDistanceFromRay(i) + senseNoise * nextGaussian();
         measurements.add(measure);
         rayReadings.set(i, measure); 
       }
     }

    return measurements;
    
  }
  
  float measurementLogProbability(ArrayList measurement) {
    float probability = 0;
    // Zero sensor noise is deterministic; retain sub-pixel likelihood
    // resolution instead of dividing by zero.
    float sigma = max(senseNoise, 0.25);
    if(!vectorMode) {
      for(int i = 0; i < poiA.size(); i++) {
        float distance = sqrt(sq(xPosition - poiA.get(i)[0])+ sq(yPosition - poiA.get(i)[1]));
        probability -= sq(distance - measurement.get(i)) / (2 * sq(sigma));
      } 
    } else {
      for (int i =0; i < rayCount; i++) {
       float myDist = this.getDistanceFromRay(i);
       probability -= sq(myDist - measurement.get(i)) / (2 * sq(sigma));
      }
    }
    return probability;
  }
  
  void move (float turn, float forward) {
   if (forward < 0) {
     ////println(name + " cannot move backwards");
     throw new Exception ( name + " cannot move backwards"); 
   }
   // add randomness to the turning command
   float tempOrientation  = orientation + turn + nextGaussian()*turnNoise;
   ////println("tempOrientation" + tempOrientation);
   tempOrientation %= TWO_PI;
   // move and add randomness to the motion
   float distance = forward + nextGaussian()* forwardNoise;
   float x = xPosition + (cos(tempOrientation) * distance);
   float y = yPosition + (sin(tempOrientation) * distance);
   x%= worldSize;
   y%= worldSize;
   ////println("X: " + x);
   ////println("Y: " + y);
   this.setRobot(x,y,tempOrientation);
   this.setNoise(forwardNoise, turnNoise, senseNoise);
  }
  
  String printString() {
    String s = new String(); 
    s = "Robot:\t[" + int(xPosition) + "," + int(yPosition)+"," + int(orientation) + "]";
    return s;
  }
  
  void drawFRobot() {
    // Robot
    if(name=="Tupac"){
      radius = radius + sin( frameCount / 4 );
    }
    //println(name + " " + radius);
    strokeWeight(strokeWidth);
    fill(myColor);  // Set fill-color to blue
    stroke(black);   // Set stroke-color black
    ellipse( xPosition, yPosition, radius, radius );  // Draw circle
   ///println(cos(orientation));
    line(xPosition, yPosition, (xPosition+cos(orientation)*radius/3), (yPosition+sin(orientation)*radius/3));
    //rotate(0);
  }
  
  float getMinDistance() {
      float minDistance = 1000;
      float minIndex = 0;
      for(int i = 0; i < rayCount; i++) { 
      //for(int i = 0; i < rayCount; i++) { 
        //if(i ==0 || i ==1 || i ==2 || i ==rayCount-1 || i ==rayCount -2) {
          float distance = this.getDistanceFromRay(i);
          if ( distance < minDistance ) {
            minDistance = distance;
            minIndex = i;
          }
        //}
      }
      //println("smallest difference " + minDistance );
      if( minIndex < rayCount/2) {
         turnLeft = false; 
      }else {
        turnLeft = true;
      }
      return minDistance;
  }
  float getDistanceFromRay(int z) {
      float rayRotation = orientation + (z*(TWO_PI/rayCount));
      float smallestDistance = rayMaxLength;
      for (int i =0; i < poiA.size(); i++) {
        smallestDistance = min(smallestDistance,
          rayBoxDistance(xPosition, yPosition, rayRotation, poiA.get(i)[0], poiA.get(i)[1]));
      }
     return smallestDistance; 
    
  }
  void drawRays() {
    strokeWeight(strokeWidth-7);
    if(!vectorMode) {
      fill(rayColor);  // Set fill-color to blue
    } else {
      fill(vectorColor);  // Set fill-color to blue      
    }
    stroke(rayColor);   // Set stroke-color black
    for (int z = 0; z < rayCount; z++) {
      float rayRotation = orientation + z * TWO_PI / rayCount;
      float smallestDistance = this.getDistanceFromRay(z);
      line((xPosition+cos(rayRotation)*radius/2), (yPosition+sin(rayRotation)*radius/2), (xPosition+cos(rayRotation)*smallestDistance), (yPosition+sin(rayRotation)*smallestDistance));      

    }

  }
}

float rayBoxDistance(float x, float y, float angle, float poiX, float poiY) {
  float near = 0;
  float far = rayMaxLength;
  float[] origins = {x, y};
  float[] directions = {cos(angle), sin(angle)};
  float[] centers = {poiX, poiY};
  for (int axis = 0; axis < 2; axis++) {
    float low = centers[axis] - poiRadius / 2;
    float high = centers[axis] + poiRadius / 2;
    if (abs(directions[axis]) < 0.000001) {
      if (origins[axis] < low || origins[axis] > high) return rayMaxLength;
    } else {
      float a = (low - origins[axis]) / directions[axis];
      float b = (high - origins[axis]) / directions[axis];
      near = max(near, min(a, b));
      far = min(far, max(a, b));
      if (near > far) return rayMaxLength;
    }
  }
  return near;
}
