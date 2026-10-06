import { useQuery } from '@tetherdb/react'

function Profile() {
    const { data: user } = useQuery('getUserInfo')
    return (
        <div>
            <h1>Profile</h1>
        </div>
    )
}

export default Profile