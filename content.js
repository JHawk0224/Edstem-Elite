courseId = 49842;

// This is needed because Edstem limits the total number of threads per request to 100
async function fetchThreads(authToken, limit) {
  const baseUrl = `https://us.edstem.org/api/courses/${courseId}/threads`;
  const maxLimitPerRequest = 100;
  const numRequests = Math.ceil(limit / maxLimitPerRequest);
  const requests = [];

  for (let i = 0; i < numRequests; i++) {
    const currentLimit = Math.min(limit - (i * maxLimitPerRequest), maxLimitPerRequest);
    const offset = i * maxLimitPerRequest;
    const url = `${baseUrl}?sort=new&limit=${currentLimit}&offset=${offset}`;
    requests.push(
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { url: url, headers: { 'X-token': `${authToken}` } },
          response => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.data['threads']);
            }
          }
        );
      })
    );
  }

  const threadsArrays = await Promise.all(requests);
  return threadsArrays.flat();
}

(async function() {
  const authToken = localStorage.getItem('authToken');

  if (!authToken) {
    console.error('Auth token not found in localStorage');
    return;
  } else {
    console.log('Auth token: ' + authToken)
  }

  const threads = await fetchThreads(authToken, 800); // This number should be around the total # of threads in Edstem
  console.log(threads);
  console.log(threads.length);

  const detailPromises = threads.map(thread => {
    return new Promise((resolve, reject) => {
      if (thread.is_staff_answered) {
        chrome.runtime.sendMessage(
          { url: `https://us.edstem.org/api/threads/${thread.id}`, headers: { 'X-token': `${authToken}` } },
          detailResponse => {
            if (detailResponse.error) {
              console.error('Error fetching thread details:', detailResponse.error);
              reject(detailResponse.error);
            } else {
              const threadData = detailResponse.data;
              const involvedAdmins = new Set();
              const users = threadData['users'];
              if (users && users.length > 0) {
                for (const user of users) {
                  if (user.course_role !== 'student') {
                    involvedAdmins.add(user.name);
                  }
                }
              }
              resolve({ is_staff_answered: true, involvedAdmins: involvedAdmins });
            }
          }
        );
      } else {
        resolve({ is_staff_answered: false });
      }
    });
  });

  const results = await Promise.all(detailPromises);

  const staffAnswers = {};
  let totalAnswered = 0;
  let totalUnanswered = 0;
  for (const thread of results) {
    if (thread.is_staff_answered) {
      for (const admin of thread.involvedAdmins) {
        staffAnswers[admin] = (staffAnswers[admin] || 0) + 1;
      }
      totalAnswered++;
    } else {
      totalUnanswered++;
    }
  }

  console.log('Staff Answer Count:', staffAnswers);
  console.log('Total:', totalAnswered + totalUnanswered);
  console.log('Total Answered:', totalAnswered);
  console.log('Total Unanswered:', totalUnanswered);
})();
