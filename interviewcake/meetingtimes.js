const meetingTimes = [
  { startTime: 0, endTime: 1 },
  { startTime: 3, endTime: 5 },
  { startTime: 4, endTime: 8 },
  { startTime: 10, endTime: 12 },
  { startTime: 9, endTime: 10 },
];

//expected:   [
//  { startTime: 0, endTime: 1 },
//  { startTime: 3, endTime: 8 },
//  { startTime: 9, endTime: 12 },
//]
const sortedMeetingTimes = meetingsCopy.sort((a, b) => {
  return a.startTime - b.startTime;
});

const mergedMeetings = [sortedMeetingTimes[0]];

for (let i = 0; i < sortedMeetingTimes.length; i++) {
  let currentMeeting = sortedMeetingTimes[i];
  let lastMergedMeeting = mergedMeetings[mergedMeetings.length - 1];
  if (currentMeeting.startTime <= lastMergedMeeting.endTime) {
    lastMergedMeeting.endTime = Math.max(
      lastMergedMeeting.endTime,
      currentMeeting.endTime,
    );
  } else {
    mergedMeetings.push(currentMeeting);
  }

  return mergedMeetings;
}
